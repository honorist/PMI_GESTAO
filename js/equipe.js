/* ============================================================
   equipe.js — Módulo Equipe (aba "Equipe")
   ------------------------------------------------------------
   "Quem é quem" do Summit: responsáveis por grupo de trabalho (GT).
   - Cabeçalho padrão (logo + título + cartão com nº de membros).
   - Membros agrupados por GT; cada grupo recebe um cabeçalho
     colorido quando o nome casa com uma disciplina do cronograma
     (Gestao.data.cronograma.disciplinas -> [{id,nome,cor}]).
   - Card por membro: nome (destaque), papel, GT (badge) e contatos.
     · email -> link mailto: (quando preenchido).
     · telefone -> link https://wa.me/<dígitos> (só dígitos; senão "—").
   - CRUD completo (modal) persistido via Gestao.save().

   Contrato consumido (window.Gestao):
     Gestao.data.equipe     = { membros:[{id,nome,gt,papel,email,telefone}] }
     Gestao.data.cronograma = { disciplinas:[{id,nome,cor}], ... }  (só leitura)
     Gestao.uid(prefix) · Gestao.save() · Gestao.onTab(id, renderFn)
     Gestao.pageHeader(opts) · Gestao.headerStat(opts)

   Segurança: todo valor do usuário vai ao DOM via textContent /
   createElement / .value. Links são <a> com .href/.textContent
   (nunca innerHTML com dados) — protegido contra XSS.
   ============================================================ */

(function () {
  "use strict";

  var TAB_ID = "tab-equipe";

  /* ============================================================
     Injeção do CSS do módulo (uma única vez)
     ============================================================ */
  function ensureStyles() {
    if (document.getElementById("eqp-css")) return;
    var link = document.createElement("link");
    link.id = "eqp-css";
    link.rel = "stylesheet";
    link.href = "css/equipe.css";
    document.head.appendChild(link);
  }

  /* ============================================================
     Helpers de DOM (seguros)
     ============================================================ */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  /* ============================================================
     Acesso aos dados
     ============================================================ */
  function getMembros() {
    var data = (window.Gestao && window.Gestao.data) || {};
    var eqp = data.equipe || {};
    if (!Array.isArray(eqp.membros)) eqp.membros = [];
    data.equipe = eqp;
    if (window.Gestao) window.Gestao.data = data;
    return eqp.membros;
  }

  function getDisciplinas() {
    var data = (window.Gestao && window.Gestao.data) || {};
    var crono = data.cronograma || {};
    return Array.isArray(crono.disciplinas) ? crono.disciplinas : [];
  }

  /* ============================================================
     Normalização de nome (casamento GT × disciplina)
     ------------------------------------------------------------
     minúsculas, sem acentos, sem conectores ("e", "de", ...),
     só letras/números. Igual à lógica de disciplinas.js.
     ============================================================ */
  function normalizar(nome) {
    return String(nome || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // remove acentos
      .replace(/\b(e|de|da|do|das|dos)\b/g, " ") // conectores
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  // Devolve a cor da disciplina cujo nome casa com o GT, ou "" se
  // não houver correspondência (igualdade ou prefixo normalizado).
  function corDoGT(gt, disciplinas) {
    var alvo = normalizar(gt);
    if (!alvo) return "";
    for (var i = 0; i < disciplinas.length; i++) {
      var d = disciplinas[i] || {};
      var n = normalizar(d.nome);
      if (!n) continue;
      if (n === alvo || n.indexOf(alvo) === 0 || alvo.indexOf(n) === 0) {
        return d.cor || "";
      }
    }
    return "";
  }

  /* ============================================================
     Contatos (links seguros)
     ============================================================ */

  // Mantém só dígitos do telefone (para o link do WhatsApp).
  function soDigitos(tel) {
    return String(tel || "").replace(/\D+/g, "");
  }

  // Cria um <a> seguro: href e texto definidos por propriedade,
  // nunca por innerHTML. Abre externos em nova aba com rel seguro.
  function link(href, texto, externo) {
    var a = el("a", "eqp-contato__link", texto);
    a.href = href;
    if (externo) {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    }
    return a;
  }

  // Linha de contato (rótulo + valor/link ou "—" quando vazio).
  function linhaContato(rotulo, valorEl) {
    var row = el("div", "eqp-contato");
    row.appendChild(el("span", "eqp-contato__rot", rotulo));
    if (valorEl) row.appendChild(valorEl);
    else row.appendChild(el("span", "eqp-contato__vazio", "—"));
    return row;
  }

  /* ============================================================
     Agrupamento por GT
     ============================================================ */

  // Agrupa membros por GT preservando a ordem de primeira aparição.
  // Devolve [{ gt, membros:[...] }]. GT vazio vira "Sem grupo".
  function agruparPorGT(membros) {
    var ordem = [];
    var mapa = {};
    membros.forEach(function (m) {
      var gt = (m.gt && String(m.gt).trim()) || "Sem grupo";
      if (!mapa[gt]) {
        mapa[gt] = [];
        ordem.push(gt);
      }
      mapa[gt].push(m);
    });
    return ordem.map(function (gt) {
      return { gt: gt, membros: mapa[gt] };
    });
  }

  /* ============================================================
     Renderização — card de membro
     ============================================================ */
  function renderCard(m) {
    var card = el("div", "card eqp-card");

    var nomeTexto = (m.nome || "").trim();
    var nome = el(
      "div",
      "eqp-card__nome" + (nomeTexto ? "" : " is-vazio"),
      nomeTexto || "Sem nome"
    );
    card.appendChild(nome);

    if (m.papel && String(m.papel).trim()) {
      card.appendChild(el("div", "eqp-card__papel", String(m.papel)));
    }

    if (m.gt && String(m.gt).trim()) {
      var meta = el("div", "eqp-card__meta");
      meta.appendChild(el("span", "badge purple", String(m.gt)));
      card.appendChild(meta);
    }

    // Contatos: email (mailto) e telefone (wa.me/<dígitos>).
    var contatos = el("div", "eqp-card__contatos");

    var email = (m.email || "").trim();
    contatos.appendChild(
      linhaContato("E-mail", email ? link("mailto:" + email, email, false) : null)
    );

    var digitos = soDigitos(m.telefone);
    var telEl = null;
    if (digitos) {
      telEl = link("https://wa.me/" + digitos, String(m.telefone).trim(), true);
    }
    contatos.appendChild(linhaContato("WhatsApp", telEl));

    card.appendChild(contatos);

    // Ações: editar / excluir.
    var actions = el("div", "eqp-card__actions");
    var edit = el("button", "btn btn-ghost sm", "Editar");
    edit.type = "button";
    edit.addEventListener("click", function () { openForm(m.id); });
    actions.appendChild(edit);

    var del = el("button", "btn btn-ghost sm", "Excluir");
    del.type = "button";
    del.addEventListener("click", function () { removeMembro(m.id, m.nome); });
    actions.appendChild(del);

    card.appendChild(actions);
    return card;
  }

  /* ============================================================
     Renderização — grupo (GT) com cabeçalho colorido
     ============================================================ */
  function renderGrupo(grupo, disciplinas) {
    var section = el("section", "eqp-grupo");
    section.setAttribute("aria-label", "Grupo: " + grupo.gt);

    var cor = corDoGT(grupo.gt, disciplinas);

    var head = el("div", "eqp-grupo__head");
    var dot = el("span", "eqp-grupo__dot");
    if (cor) dot.style.background = cor;
    head.appendChild(dot);
    head.appendChild(el("h3", "eqp-grupo__title", grupo.gt));
    var n = grupo.membros.length;
    head.appendChild(
      el("span", "eqp-grupo__count", n + (n === 1 ? " membro" : " membros"))
    );
    // Faixa colorida à esquerda do cabeçalho do grupo, quando há cor.
    if (cor) head.style.borderLeftColor = cor;
    section.appendChild(head);

    var grid = el("div", "grid cols-3 eqp-grid");
    grupo.membros.forEach(function (m) {
      grid.appendChild(renderCard(m));
    });
    section.appendChild(grid);

    return section;
  }

  /* ============================================================
     CRUD
     ============================================================ */
  function findMembro(id) {
    var list = getMembros();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function upsertMembro(id, values) {
    var list = getMembros();
    if (id) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) {
          list[i] = Object.assign({}, list[i], values, { id: id });
          break;
        }
      }
    } else {
      list.push(Object.assign({ id: window.Gestao.uid("m") }, values));
    }
    window.Gestao.save();
    render();
  }

  function removeMembro(id, nome) {
    var label = nome && String(nome).trim() ? '"' + nome + '"' : "este membro";
    if (!window.confirm("Excluir " + label + "?")) return;
    var data = window.Gestao.data;
    data.equipe.membros = getMembros().filter(function (x) {
      return x.id !== id;
    });
    window.Gestao.save();
    render();
  }

  /* ============================================================
     Formulário (modal)
     ============================================================ */
  var _backdrop = null;

  function closeForm() {
    if (_backdrop && _backdrop.parentNode) {
      _backdrop.parentNode.removeChild(_backdrop);
    }
    _backdrop = null;
    document.removeEventListener("keydown", onEscClose);
  }

  function onEscClose(e) {
    if (e.key === "Escape") closeForm();
  }

  function field(labelText, inputEl, full) {
    var wrap = el("div", "eqp-field" + (full ? " full" : ""));
    var id = "eqp-f-" + window.Gestao.uid("x");
    var lbl = el("label", null, labelText);
    lbl.setAttribute("for", id);
    inputEl.id = id;
    wrap.appendChild(lbl);
    wrap.appendChild(inputEl);
    return wrap;
  }

  function makeInput(type, value) {
    var inp = document.createElement("input");
    inp.type = type;
    if (value !== undefined && value !== null) inp.value = String(value);
    return inp;
  }

  function openForm(id) {
    var existing = id ? findMembro(id) : null;

    closeForm();

    _backdrop = el("div", "eqp-modal-backdrop");
    _backdrop.addEventListener("click", function (e) {
      void e; /* clicar fora NÃO fecha (evita perda acidental); use Cancelar ou Esc */
    });

    var modal = el("div", "eqp-modal");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", existing ? "Editar membro" : "Novo membro");
    modal.appendChild(
      el("h3", "section-title", existing ? "Editar membro" : "Novo membro")
    );

    var form = document.createElement("form");
    form.className = "eqp-form";

    var inNome = makeInput("text", existing ? existing.nome : "");
    inNome.placeholder = "Nome completo";
    inNome.required = true;
    form.appendChild(field("Nome", inNome, true));

    // GT: input com datalist alimentado pelas disciplinas (sugestão),
    // sem travar — o usuário pode digitar um GT novo.
    var inGT = makeInput("text", existing ? existing.gt || "" : "");
    inGT.placeholder = "Grupo de trabalho";
    var listId = "eqp-gt-list";
    inGT.setAttribute("list", listId);
    var datalist = document.createElement("datalist");
    datalist.id = listId;
    getDisciplinas().forEach(function (d) {
      if (!d || !d.nome) return;
      var opt = document.createElement("option");
      opt.value = d.nome;
      datalist.appendChild(opt);
    });
    var gtField = field("GT (grupo de trabalho)", inGT);
    gtField.appendChild(datalist);
    form.appendChild(gtField);

    var inPapel = makeInput("text", existing ? existing.papel || "" : "");
    inPapel.placeholder = "Ex.: Gerente de Projetos";
    form.appendChild(field("Papel", inPapel));

    var inEmail = makeInput("email", existing ? existing.email || "" : "");
    inEmail.placeholder = "nome@exemplo.com";
    form.appendChild(field("E-mail", inEmail));

    var inTel = makeInput("tel", existing ? existing.telefone || "" : "");
    inTel.placeholder = "(51) 99999-9999";
    form.appendChild(field("Telefone", inTel));

    var actions = el("div", "eqp-form-actions");
    var cancel = el("button", "btn", "Cancelar");
    cancel.type = "button";
    cancel.addEventListener("click", closeForm);
    actions.appendChild(cancel);
    var salvar = el("button", "btn btn-primary", "Salvar");
    salvar.type = "submit";
    actions.appendChild(salvar);
    form.appendChild(actions);

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var nome = inNome.value.trim();
      if (!nome) {
        inNome.focus();
        return;
      }
      var values = {
        nome: nome,
        gt: inGT.value.trim(),
        papel: inPapel.value.trim(),
        email: inEmail.value.trim(),
        telefone: inTel.value.trim()
      };
      upsertMembro(id, values);
      closeForm();
    });

    modal.appendChild(form);
    _backdrop.appendChild(modal);
    document.body.appendChild(_backdrop);
    document.addEventListener("keydown", onEscClose);
    inNome.focus();
  }

  /* ============================================================
     Cabeçalho padrão da aba
     ============================================================ */
  function buildHeader(membros) {
    var Gestao = window.Gestao;
    var n = membros.length;
    var right = Gestao.headerStat({
      label: "Equipe",
      value: String(n),
      sub: n === 1 ? "membro" : "membros",
      accent: true
    });
    return Gestao.pageHeader({
      eyebrow: "EQUIPE · SUMMIT POA PMIRS 2026",
      title: "Quem é quem",
      subtitle: "Responsáveis por grupo de trabalho (GT)",
      right: right
    });
  }

  /* ============================================================
     Hierarquia (organograma): Presidente → GP → demais
     ------------------------------------------------------------
     Deriva os níveis do papel/GT: presidente no topo, Gerente de
     Projetos no 2º nível, e todos os demais abaixo.
     ============================================================ */
  function classificar(membros) {
    var pres = null;
    var vp = null;
    var gp = null;
    var resto = [];
    membros.forEach(function (m) {
      var papel = normalizar(m.papel);
      var gt = normalizar(m.gt);
      if (!pres && (gt.indexOf("presidencia") === 0 || papel.indexOf("presidente") >= 0)) {
        pres = m;
      } else if (!vp && (papel.indexOf("vp") >= 0 || papel.indexOf("vice") >= 0)) {
        vp = m; // VP / Vice-presidência (entre Presidente e GP)
      } else if (!gp && papel.indexOf("gerente") >= 0 && papel.indexOf("projetos") >= 0) {
        gp = m;
      } else {
        resto.push(m);
      }
    });
    return { pres: pres, vp: vp, gp: gp, resto: resto };
  }

  // Nó do organograma = card do membro, com borda superior na cor do GT.
  function renderNode(m, disciplinas) {
    var card = renderCard(m);
    var cor = corDoGT(m.gt, disciplinas);
    if (cor) card.style.borderTop = "4px solid " + cor;
    return card;
  }

  // Organograma clássico top-down: Marcio → Germânia → equipe (caixas
  // pequenas ligadas por linhas; rola na horizontal se não couber).
  function miniNode(m, disciplinas) {
    var cor = corDoGT(m.gt, disciplinas) || "#36177B";
    var box = el("div", "eqp-onode");
    box.style.borderTopColor = cor;

    box.appendChild(el("div", "eqp-onode__nome", (m.nome || "").trim() || "—"));
    if (m.papel && String(m.papel).trim()) {
      box.appendChild(el("div", "eqp-onode__papel", String(m.papel)));
    }
    if (m.gt && String(m.gt).trim()) {
      box.appendChild(el("span", "badge purple eqp-onode__gt", String(m.gt)));
    }
    var act = el("div", "eqp-onode__act");
    var ed = el("button", "eqp-onode__btn", "✎");
    ed.type = "button";
    ed.title = "Editar";
    ed.addEventListener("click", function () { openForm(m.id); });
    var dl = el("button", "eqp-onode__btn", "×");
    dl.type = "button";
    dl.title = "Excluir";
    dl.addEventListener("click", function () { removeMembro(m.id, m.nome); });
    act.appendChild(ed);
    act.appendChild(dl);
    box.appendChild(act);
    return box;
  }

  function buildOrg(membros, disciplinas) {
    var c = classificar(membros);
    var scroller = el("div", "eqp-oc-scroll");
    var oc = el("div", "eqp-oc");

    if (c.pres) {
      var temAbaixo = c.vp || c.gp || c.resto.length;
      var l0 = el("div", "eqp-oc__lvl" + (temAbaixo ? " eqp-oc__lvl--drop" : ""));
      l0.appendChild(miniNode(c.pres, disciplinas));
      oc.appendChild(l0);
    }
    if (c.vp) {
      var temAbaixoVp = c.gp || c.resto.length;
      var lvp = el("div", "eqp-oc__lvl" + (temAbaixoVp ? " eqp-oc__lvl--drop" : ""));
      lvp.appendChild(miniNode(c.vp, disciplinas));
      oc.appendChild(lvp);
    }
    if (c.gp) {
      var l1 = el("div", "eqp-oc__lvl" + (c.resto.length ? " eqp-oc__lvl--drop" : ""));
      l1.appendChild(miniNode(c.gp, disciplinas));
      oc.appendChild(l1);
    }
    if (c.resto.length) {
      var row = el("div", "eqp-oc__row" + (c.resto.length === 1 ? " is-single" : ""));
      c.resto.forEach(function (m) {
        var col = el("div", "eqp-oc__col");
        col.appendChild(miniNode(m, disciplinas));
        row.appendChild(col);
      });
      oc.appendChild(row);
    }

    scroller.appendChild(oc);
    return scroller;
  }

  /* ============================================================
     Render principal
     ============================================================ */
  var _mount = null;

  function render() {
    if (!_mount) return;
    var membros = getMembros();
    var disciplinas = getDisciplinas();
    clear(_mount);

    _mount.appendChild(buildHeader(membros));

    var root = el("div", "stack");

    var bar = el("div", "spread");
    bar.appendChild(
      el("span", "muted-text", "Cadastre os responsáveis de cada grupo de trabalho.")
    );
    var addBtn = el("button", "btn btn-primary sm", "+ Membro");
    addBtn.type = "button";
    addBtn.addEventListener("click", function () { openForm(null); });
    bar.appendChild(addBtn);
    root.appendChild(bar);

    if (!membros.length) {
      root.appendChild(
        el("div", "empty", "Nenhum membro cadastrado. Use “+ Membro”.")
      );
    } else {
      root.appendChild(buildOrg(membros, disciplinas));
    }

    _mount.appendChild(root);
  }

  /* ============================================================
     Registro no app
     ============================================================ */
  function init(mountEl /*, data */) {
    ensureStyles();
    _mount = mountEl;
    render();
  }

  if (typeof window !== "undefined") {
    if (window.Gestao && typeof window.Gestao.onTab === "function") {
      window.Gestao.onTab(TAB_ID, init);
    } else {
      document.addEventListener("DOMContentLoaded", function () {
        if (window.Gestao && typeof window.Gestao.onTab === "function") {
          window.Gestao.onTab(TAB_ID, init);
        }
      });
    }
  }

  // Exposto para testes headless (funções puras).
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      normalizar: normalizar,
      corDoGT: corDoGT,
      soDigitos: soDigitos,
      agruparPorGT: agruparPorGT
    };
  }
})();
