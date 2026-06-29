/* ============================================================
   voluntarios.js — Módulo Voluntários (aba "Voluntários")
   ------------------------------------------------------------
   Cadastro de voluntários do Summit PMI-RS 2026 (dias 13 e 14).
   - Cabeçalho padrão com contagem total de voluntários.
   - Cards agrupados por dia de atuação: 13 nov / 14 nov / Ambos.
   - Cada card exibe: nome, função, telefone (WhatsApp), e-mail.
   - CRUD completo (modal) persistido via Gestao.save().

   Contrato consumido (window.Gestao):
     Gestao.data.voluntarios = { voluntarios:[{id,nome,funcao,telefone,email,dia,turno}] }
     Gestao.uid(prefix) · Gestao.save() · Gestao.onTab(id, renderFn)
     Gestao.pageHeader(opts) · Gestao.headerStat(opts)

   dia: "13" | "14" | "ambos"
   turno: "manha" | "tarde" | "integral"

   Segurança: todo valor do usuário vai ao DOM via textContent /
   createElement / .value. Links são <a> com .href/.textContent.
   ============================================================ */

(function () {
  "use strict";

  var TAB_ID = "tab-voluntarios";

  /* ============================================================
     Injeção do CSS do módulo (uma única vez)
     ============================================================ */
  function ensureStyles() {
    if (document.getElementById("vol-css")) return;
    var link = document.createElement("link");
    link.id = "vol-css";
    link.rel = "stylesheet";
    link.href = "css/voluntarios.css";
    document.head.appendChild(link);
  }

  /* ============================================================
     Helpers de DOM (seguros — nunca innerHTML com dados)
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
  function getVoluntarios() {
    var data = (window.Gestao && window.Gestao.data) || {};
    var vol = data.voluntarios || {};
    if (!Array.isArray(vol.voluntarios)) vol.voluntarios = [];
    data.voluntarios = vol;
    if (window.Gestao) window.Gestao.data = data;
    return vol.voluntarios;
  }

  /* ============================================================
     Helpers de contato
     ============================================================ */
  function soDigitos(tel) {
    return String(tel || "").replace(/\D+/g, "");
  }

  function linkEl(href, texto, externo) {
    var a = el("a", "vol-link", texto);
    a.href = href;
    if (externo) {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    }
    return a;
  }

  function linhaContato(rotulo, valorEl) {
    var row = el("div", "vol-contato");
    row.appendChild(el("span", "vol-contato__rot", rotulo));
    if (valorEl) row.appendChild(valorEl);
    else row.appendChild(el("span", "vol-contato__vazio", "—"));
    return row;
  }

  /* ============================================================
     Agrupamento por dia
     Ordem fixa: "13" → "14" → "ambos"
     ============================================================ */
  var GRUPOS_DIA = [
    { dia: "13",    label: "13 de novembro",  classe: "vol-dia--13" },
    { dia: "14",    label: "14 de novembro",  classe: "vol-dia--14" },
    { dia: "ambos", label: "Ambos os dias",   classe: "vol-dia--ambos" }
  ];

  function labelDia(dia) {
    for (var i = 0; i < GRUPOS_DIA.length; i++) {
      if (GRUPOS_DIA[i].dia === dia) return GRUPOS_DIA[i].label;
    }
    return dia || "—";
  }

  function agruparPorDia(voluntarios) {
    var mapa = { "13": [], "14": [], "ambos": [], "_outro": [] };
    voluntarios.forEach(function (v) {
      var d = v.dia && String(v.dia).trim();
      if (d === "13" || d === "14" || d === "ambos") mapa[d].push(v);
      else mapa["_outro"].push(v);
    });
    var grupos = [];
    GRUPOS_DIA.forEach(function (g) {
      if (mapa[g.dia].length) {
        grupos.push({ dia: g.dia, label: g.label, classe: g.classe, items: mapa[g.dia] });
      }
    });
    if (mapa["_outro"].length) {
      grupos.push({ dia: "?", label: "Dia não definido", classe: "vol-dia--outro", items: mapa["_outro"] });
    }
    return grupos;
  }

  /* ============================================================
     Renderização — card de voluntário
     ============================================================ */
  function renderCard(v) {
    var card = el("div", "card vol-card");

    var nomeTexto = (v.nome || "").trim();
    card.appendChild(el(
      "div",
      "vol-card__nome" + (nomeTexto ? "" : " is-vazio"),
      nomeTexto || "Sem nome"
    ));

    if (v.funcao && String(v.funcao).trim()) {
      var meta = el("div", "vol-card__meta");
      meta.appendChild(el("span", "badge vol-badge-funcao", String(v.funcao)));
      var diaBadgeClass = "badge vol-badge-dia" + (
        v.dia === "13"    ? " vol-badge-dia--13" :
        v.dia === "14"    ? " vol-badge-dia--14" :
        v.dia === "ambos" ? " vol-badge-dia--ambos" : ""
      );
      meta.appendChild(el("span", diaBadgeClass, labelDia(v.dia)));
      if (v.turno) {
        var turnoLabels = { manha: "Manhã (8h–12h)", tarde: "Tarde (13h–18h)", integral: "Integral (8h–18h)" };
        meta.appendChild(el("span", "vol-card__turno muted-text", turnoLabels[v.turno] || v.turno));
      }
      card.appendChild(meta);
    }

    var contatos = el("div", "vol-card__contatos");

    var digitos = soDigitos(v.telefone);
    var telEl = digitos
      ? linkEl("https://wa.me/" + digitos, String(v.telefone).trim(), true)
      : null;
    contatos.appendChild(linhaContato("WhatsApp", telEl));

    var email = (v.email || "").trim();
    contatos.appendChild(
      linhaContato("E-mail", email ? linkEl("mailto:" + email, email, false) : null)
    );
    card.appendChild(contatos);

    if (!window.Gestao || !window.Gestao.readonly) {
      var actions = el("div", "vol-card__actions");
      var edit = el("button", "btn btn-ghost sm", "Editar");
      edit.type = "button";
      edit.addEventListener("click", function () { openForm(v.id); });
      actions.appendChild(edit);
      var del = el("button", "btn btn-ghost sm", "Excluir");
      del.type = "button";
      del.addEventListener("click", function () { removeVoluntario(v.id, v.nome); });
      actions.appendChild(del);
      card.appendChild(actions);
    }

    return card;
  }

  /* ============================================================
     Renderização — seção por dia
     ============================================================ */
  function renderGrupoDia(grupo) {
    var section = el("section", "vol-dia");
    section.setAttribute("aria-label", "Voluntários — " + grupo.label);

    var head = el("div", "vol-dia__head " + grupo.classe);
    head.appendChild(el("h3", "vol-dia__title", grupo.label));
    var n = grupo.items.length;
    head.appendChild(
      el("span", "vol-dia__count", n + (n === 1 ? " voluntário" : " voluntários"))
    );
    section.appendChild(head);

    var grid = el("div", "grid cols-3 vol-grid");
    grupo.items.forEach(function (v) {
      grid.appendChild(renderCard(v));
    });
    section.appendChild(grid);

    return section;
  }

  /* ============================================================
     CRUD
     ============================================================ */
  function findVoluntario(id) {
    var list = getVoluntarios();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function upsertVoluntario(id, values) {
    var list = getVoluntarios();
    if (id) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) {
          list[i] = Object.assign({}, list[i], values, { id: id });
          break;
        }
      }
    } else {
      list.push(Object.assign({ id: window.Gestao.uid("vl") }, values));
    }
    window.Gestao.save();
    window.Gestao.toast("Voluntário salvo");
    render();
  }

  function removeVoluntario(id, nome) {
    var label = nome && String(nome).trim() ? '"' + nome + '"' : "este voluntário";
    Gestao.confirm("Excluir " + label + "?", function () {
      var data = window.Gestao.data;
      data.voluntarios.voluntarios = getVoluntarios().filter(function (x) { return x.id !== id; });
      window.Gestao.save();
      Gestao.toast("Voluntário removido");
      render();
    });
    return; // sai imediatamente — o callback cuida do resto
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
    var wrap = el("div", "vol-field" + (full ? " full" : ""));
    var id = "vol-f-" + window.Gestao.uid("x");
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

  function makeSelect(options, current) {
    var sel = document.createElement("select");
    options.forEach(function (opt) {
      var o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      if (opt.value === current) o.selected = true;
      sel.appendChild(o);
    });
    return sel;
  }

  function openForm(id) {
    var existing = id ? findVoluntario(id) : null;
    closeForm();

    _backdrop = el("div", "vol-modal-backdrop");

    var modal = el("div", "vol-modal");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", existing ? "Editar voluntário" : "Novo voluntário");
    modal.appendChild(
      el("h3", "section-title", existing ? "Editar voluntário" : "Novo voluntário")
    );

    var form = document.createElement("form");
    form.className = "vol-form";

    var inNome = makeInput("text", existing ? existing.nome : "");
    inNome.placeholder = "Nome completo";
    inNome.required = true;
    form.appendChild(field("Nome *", inNome, true));

    var inFuncao = makeInput("text", existing ? existing.funcao || "" : "");
    inFuncao.placeholder = "Ex.: Recepção, Credenciamento, Apoio Técnico…";
    inFuncao.required = true;
    var funcaoListId = "vol-funcao-list";
    inFuncao.setAttribute("list", funcaoListId);
    var funcaoDL = document.createElement("datalist");
    funcaoDL.id = funcaoListId;
    var funcoesCadastradas = [];
    getVoluntarios().forEach(function (v) {
      var f = (v.funcao || "").trim();
      if (f && funcoesCadastradas.indexOf(f) === -1) funcoesCadastradas.push(f);
    });
    funcoesCadastradas.sort().forEach(function (f) {
      var opt = document.createElement("option");
      opt.value = f;
      funcaoDL.appendChild(opt);
    });
    var funcaoField = field("Função *", inFuncao, true);
    funcaoField.appendChild(funcaoDL);
    var labelFuncao = funcaoField.querySelector("label");
    if (labelFuncao) window.Gestao.addTooltip(labelFuncao, "Ex.: Recepção, Credenciamento, Apoio Técnico, Comunicação");
    form.appendChild(funcaoField);

    var inTel = makeInput("tel", existing ? existing.telefone || "" : "");
    inTel.placeholder = "(51) 99999-9999";
    window.Gestao.maskPhone(inTel);
    form.appendChild(field("Telefone", inTel));

    var inEmail = makeInput("email", existing ? existing.email || "" : "");
    inEmail.placeholder = "nome@exemplo.com";
    form.appendChild(field("E-mail", inEmail));

    var selDia = makeSelect([
      { value: "13",    label: "13 de novembro" },
      { value: "14",    label: "14 de novembro" },
      { value: "ambos", label: "Ambos os dias"  }
    ], existing ? existing.dia || "13" : "13");
    form.appendChild(field("Dia de atuação", selDia));

    var selTurno = makeSelect([
      { value: "manha",    label: "Manhã (8h–12h)"   },
      { value: "tarde",    label: "Tarde (13h–18h)"  },
      { value: "integral", label: "Integral (8h–18h)" }
    ], existing ? existing.turno || "integral" : "integral");
    form.appendChild(field("Turno", selTurno));

    var actions = el("div", "vol-form-actions");
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
      var funcao = inFuncao.value.trim();
      if (!nome) { inNome.focus(); return; }
      if (!funcao) { inFuncao.focus(); return; }
      upsertVoluntario(id, {
        nome: nome,
        funcao: funcao,
        telefone: inTel.value.trim(),
        email: inEmail.value.trim(),
        dia: selDia.value,
        turno: selTurno.value
      });
      closeForm();
    });

    modal.appendChild(form);
    _backdrop.appendChild(modal);
    document.body.appendChild(_backdrop);
    document.addEventListener("keydown", onEscClose);
    inNome.focus();
  }

  /* ============================================================
     Cabeçalho da aba
     ============================================================ */
  function buildHeader(voluntarios) {
    var Gestao = window.Gestao;
    var n = voluntarios.length;
    var right = Gestao.headerStat({
      label: "Voluntários",
      value: String(n),
      sub: n === 1 ? "voluntário" : "voluntários",
      accent: true
    });
    return Gestao.pageHeader({
      eyebrow: "VOLUNTÁRIOS · SUMMIT POA PMIRS 2026",
      title: "Equipe de Voluntários",
      subtitle: "Colaboradores voluntários nos dias 13 e 14 de novembro",
      right: right
    });
  }

  /* ============================================================
     Render principal
     ============================================================ */
  var _mount = null;

  function render() {
    if (!_mount) return;
    var voluntarios = getVoluntarios();
    clear(_mount);

    _mount.appendChild(buildHeader(voluntarios));

    var root = el("div", "stack");

    var bar = el("div", "spread");
    bar.appendChild(
      el("span", "muted-text", "Cadastre os voluntários e a função que irão exercer em cada dia do evento.")
    );
    if (!window.Gestao || !window.Gestao.readonly) {
      var addBtn = el("button", "btn btn-primary sm", "+ Voluntário");
      addBtn.type = "button";
      addBtn.addEventListener("click", function () { openForm(null); });
      bar.appendChild(addBtn);
    }
    root.appendChild(bar);

    if (!voluntarios.length) {
      root.appendChild(Gestao.emptyState("Nenhum voluntário cadastrado ainda.", "+ Voluntário", function () { openForm(null); }));
    } else {
      var grupos = agruparPorDia(voluntarios);
      grupos.forEach(function (g) {
        root.appendChild(renderGrupoDia(g));
      });
    }

    _mount.appendChild(root);
  }

  /* ============================================================
     Registro no app
     ============================================================ */
  function init(mountEl) {
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

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { agruparPorDia: agruparPorDia, soDigitos: soDigitos };
  }
})();
