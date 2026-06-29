/* ============================================================
   contratacoes.js — Módulo Contratações (aba "Contratações")
   ------------------------------------------------------------
   Gestão de fornecedores/contratos:
   - Resumo no topo (total de contratos, valor fechado, valor
     em negociação, nº a contratar).
   - Kanban por status (a_contratar / negociando / fechado) com
     contagem e valor total por coluna.
   - Cada card mostra nome, categoria, disciplina, valor, contato,
     observação; permite mudar status, editar e excluir.
   - CRUD completo (modal) persistido via Gestao.save().

   Contrato consumido (window.Gestao):
     Gestao.data.contratacoes = { fornecedores:[...] }
     Gestao.data.cronograma   = { disciplinas:[{id,nome,cor}], ... }
     Gestao.fmtBRL(n) · Gestao.uid(prefix) · Gestao.save()
     Gestao.onTab(id, renderFn)

   Segurança: dados do usuário vão ao DOM via textContent/.value.
   ============================================================ */

(function () {
  "use strict";

  var TAB_ID = "tab-contratacoes";

  // Ordem e rótulos das colunas/status.
  var STATUSES = [
    { id: "a_contratar", label: "A contratar", badge: "muted" },
    { id: "negociando", label: "Negociando", badge: "orange" },
    { id: "fechado", label: "Fechado", badge: "green" },
    { id: "cancelado", label: "Cancelado", badge: "canceled" }
  ];

  /* ============================================================
     Injeção do CSS do módulo
     ============================================================ */
  function ensureStyles() {
    var HREF = "css/contratacoes.css";
    var found = false;
    document.querySelectorAll('link[rel="stylesheet"]').forEach(function (l) {
      if (l.getAttribute("href") === HREF) found = true;
    });
    if (found) return;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = HREF;
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

  function toNumber(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  /* ============================================================
     Acesso aos dados
     ============================================================ */
  function getFornecedores() {
    var data = (window.Gestao && window.Gestao.data) || {};
    var ctr = data.contratacoes || {};
    if (!Array.isArray(ctr.fornecedores)) ctr.fornecedores = [];
    data.contratacoes = ctr;
    if (window.Gestao) window.Gestao.data = data;
    return ctr.fornecedores;
  }

  // Mapa disciplinaId -> nome, lido do cronograma (somente leitura).
  function disciplinaMap() {
    var data = (window.Gestao && window.Gestao.data) || {};
    var crono = data.cronograma || {};
    var list = Array.isArray(crono.disciplinas) ? crono.disciplinas : [];
    var map = {};
    list.forEach(function (d) {
      if (d && d.id) map[d.id] = d;
    });
    return map;
  }

  function disciplinaNome(disciplinaId) {
    if (!disciplinaId) return "";
    var d = disciplinaMap()[disciplinaId];
    return d ? d.nome : disciplinaId;
  }

  function isStatusValido(s) {
    return STATUSES.some(function (x) { return x.id === s; });
  }

  /* ============================================================
     Resumo / KPIs
     ============================================================ */
  function computeResumo(fornecedores) {
    var total = fornecedores.length;
    var valorFechado = 0;
    var valorNegociando = 0;
    var nAContratar = 0;
    fornecedores.forEach(function (f) {
      var status = isStatusValido(f.status) ? f.status : "a_contratar";
      if (status === "fechado") valorFechado += toNumber(f.valor);
      else if (status === "negociando") valorNegociando += toNumber(f.valor);
      else if (status === "cancelado") { /* não conta em nAContratar */ }
      else nAContratar += 1;
    });
    return {
      total: total,
      valorFechado: valorFechado,
      valorNegociando: valorNegociando,
      nAContratar: nAContratar
    };
  }

  function kpiCard(opts) {
    var card = el("div", "card");
    var box = el("div", "ctr-kpi" + (opts.typeClass ? " " + opts.typeClass : ""));
    box.appendChild(el("span", "ctr-kpi-label", opts.label));
    box.appendChild(el("span", "ctr-kpi-value", opts.value));
    card.appendChild(box);
    return card;
  }

  function renderResumo(fornecedores) {
    var r = computeResumo(fornecedores);
    var Gestao = window.Gestao;
    var grid = el("div", "grid cols-4");
    grid.appendChild(kpiCard({ label: "Contratos", value: String(r.total) }));
    grid.appendChild(
      kpiCard({ label: "Valor fechado", value: Gestao.fmtBRL(r.valorFechado), typeClass: "t-fechado" })
    );
    grid.appendChild(
      kpiCard({ label: "Em negociação", value: Gestao.fmtBRL(r.valorNegociando), typeClass: "t-negociando" })
    );
    grid.appendChild(
      kpiCard({ label: "A contratar", value: String(r.nAContratar), typeClass: "t-acontratar" })
    );
    return grid;
  }

  /* ============================================================
     Kanban por status
     ============================================================ */
  function groupByStatus(fornecedores) {
    var groups = { a_contratar: [], negociando: [], fechado: [], cancelado: [] };
    fornecedores.forEach(function (f) {
      var status = isStatusValido(f.status) ? f.status : "a_contratar";
      groups[status].push(f);
    });
    return groups;
  }

  function renderKanban(fornecedores) {
    var groups = groupByStatus(fornecedores);
    var board = el("div", "ctr-kanban");
    STATUSES.forEach(function (st) {
      board.appendChild(renderColuna(st, groups[st.id]));
    });
    return board;
  }

  function renderColuna(st, items) {
    var Gestao = window.Gestao;
    var col = el("div", "ctr-col s-" + st.id);

    var head = el("div", "ctr-col-head");
    var title = el("div", "ctr-col-title");
    title.appendChild(el("span", "ctr-col-dot"));
    title.appendChild(el("span", null, st.label));
    head.appendChild(title);

    var valor = items.reduce(function (acc, f) { return acc + toNumber(f.valor); }, 0);
    var meta = el("div", "ctr-col-meta");
    var n = el("strong", null, String(items.length));
    meta.appendChild(n);
    meta.appendChild(document.createTextNode(items.length === 1 ? " contrato" : " contratos"));
    meta.appendChild(el("div", null, Gestao.fmtBRL(valor)));
    head.appendChild(meta);
    col.appendChild(head);

    var list = el("div", "ctr-col-list");
    if (!items.length) {
      list.appendChild(Gestao.emptyState("Vazio", "+ Contrato", function () { openForm(null); }));
    } else {
      items.forEach(function (f) {
        list.appendChild(renderCard(f));
      });
    }
    col.appendChild(list);
    return col;
  }

  function renderCard(f) {
    var Gestao = window.Gestao;
    var card = el("div", "ctr-card");

    // Nome (placeholder amigável quando vazio).
    var nomeTexto = (f.nome || "").trim();
    var nome = el("div", "ctr-card-nome" + (nomeTexto ? "" : " is-vazio"), nomeTexto || "Fornecedor a definir");
    card.appendChild(nome);

    // Valor.
    card.appendChild(el("div", "ctr-card-valor", Gestao.fmtBRL(f.valor)));

    // Metadados (categoria + disciplina).
    var meta = el("div", "ctr-card-meta");
    if (f.categoria) {
      meta.appendChild(badge(f.categoria, "purple"));
    }
    var disc = disciplinaNome(f.disciplinaId);
    if (disc) meta.appendChild(badge(disc, "blue"));
    if (meta.childNodes.length) card.appendChild(meta);

    // Contato.
    if (f.contato && String(f.contato).trim()) {
      card.appendChild(el("div", "ctr-card-meta", String(f.contato)));
    }

    // Observação.
    if (f.observacao && String(f.observacao).trim()) {
      card.appendChild(el("div", "ctr-card-obs", String(f.observacao)));
    }

    // Proposta anexada — link de download a partir do dataUrl salvo.
    if (f.proposta && f.proposta.dataUrl) {
      var prop = el("a", "ctr-card-anexo", "📎 " + (f.proposta.nome || "Proposta"));
      prop.href = f.proposta.dataUrl;
      prop.download = f.proposta.nome || "proposta";
      card.appendChild(prop);
    }

    // Rodapé: select de status + ações.
    var foot = el("div", "ctr-card-foot");
    foot.appendChild(buildStatusSelect(f));

    var actions = el("div", "ctr-actions");
    var edit = el("button", "btn btn-ghost sm", "Editar");
    edit.type = "button";
    edit.addEventListener("click", function () { openForm(f.id); });
    actions.appendChild(edit);

    var del = el("button", "btn btn-ghost sm", "Excluir");
    del.type = "button";
    del.addEventListener("click", function () { removeFornecedor(f.id, f.nome); });
    actions.appendChild(del);

    foot.appendChild(actions);
    card.appendChild(foot);
    return card;
  }

  function badge(text, color) {
    return el("span", "badge " + color, text);
  }

  // Select que muda o status do fornecedor diretamente do card.
  function buildStatusSelect(f) {
    var sel = document.createElement("select");
    sel.className = "ctr-status-select";
    sel.setAttribute("aria-label", "Mudar status");
    var current = isStatusValido(f.status) ? f.status : "a_contratar";
    STATUSES.forEach(function (st) {
      var opt = document.createElement("option");
      opt.value = st.id;
      opt.textContent = st.label;
      if (st.id === current) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", function () {
      changeStatus(f.id, sel.value);
    });
    return sel;
  }

  /* ============================================================
     CRUD + mudança de status
     ============================================================ */
  function findFornecedor(id) {
    var list = getFornecedores();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function changeStatus(id, status) {
    if (!isStatusValido(status)) return;
    var list = getFornecedores();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        list[i] = Object.assign({}, list[i], { status: status });
        break;
      }
    }
    window.Gestao.save();
    render();
  }

  function upsertFornecedor(id, values) {
    var list = getFornecedores();
    if (id) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) {
          list[i] = Object.assign({}, list[i], values, { id: id });
          break;
        }
      }
    } else {
      var novo = Object.assign({ id: window.Gestao.uid("f") }, values);
      list.push(novo);
    }
    window.Gestao.save();
    window.Gestao.toast("Contrato salvo");
    render();
  }

  function removeFornecedor(id, nome) {
    var label = nome && String(nome).trim() ? '"' + nome + '"' : "este fornecedor";
    window.Gestao.confirm("Excluir " + label + "?", function () {
      var data = window.Gestao.data;
      data.contratacoes.fornecedores = getFornecedores().filter(function (x) {
        return x.id !== id;
      });
      window.Gestao.save();
      window.Gestao.toast("Contrato removido");
      render();
    });
  }

  /* ============================================================
     Formulário (modal)
     ============================================================ */
  var _backdrop = null;

  function closeForm() {
    if (_backdrop && _backdrop.parentNode) _backdrop.parentNode.removeChild(_backdrop);
    _backdrop = null;
    document.removeEventListener("keydown", onEscClose);
  }

  function onEscClose(e) {
    if (e.key === "Escape") closeForm();
  }

  function field(labelText, inputEl, full) {
    var wrap = el("div", "ctr-field" + (full ? " full" : ""));
    var id = "ctr-f-" + window.Gestao.uid("x");
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

  // Parse pt-BR de valor monetário (espelha o do financeiro).
  function parseBRL(text) {
    if (text === null || text === undefined) return 0;
    var s = String(text).trim();
    if (s === "") return 0;
    s = s.replace(/[^0-9.,-]/g, "");
    if (s === "" || s === "-") return 0;
    var hasComma = s.indexOf(",") !== -1;
    var hasDot = s.indexOf(".") !== -1;
    if (hasComma && hasDot) s = s.replace(/\./g, "").replace(",", ".");
    else if (hasComma) s = s.replace(",", ".");
    else if (hasDot && /^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  function brlInput(n) {
    var v = toNumber(n);
    if (v === 0) return "";
    return String(v).replace(".", ",");
  }

  function openForm(id) {
    var existing = id ? findFornecedor(id) : null;

    closeForm();

    _backdrop = el("div", "ctr-modal-backdrop");
    _backdrop.addEventListener("click", function (e) {
      void e; /* clicar fora NÃO fecha (evita perda acidental); use Cancelar ou Esc */
    });

    var modal = el("div", "ctr-modal");
    modal.appendChild(
      el("h3", "section-title", existing ? "Editar fornecedor" : "Novo fornecedor")
    );

    var form = document.createElement("form");
    form.className = "ctr-form";

    var inNome = makeInput("text", existing ? existing.nome : "");
    inNome.placeholder = "Nome do fornecedor";
    form.appendChild(field("Nome", inNome, true));

    var inCategoria = makeInput("text", existing ? existing.categoria : "");
    inCategoria.placeholder = "Ex.: Audiovisual";
    form.appendChild(field("Categoria", inCategoria));

    // Disciplina: select alimentado pelo cronograma.
    var selDisc = document.createElement("select");
    var optNone = document.createElement("option");
    optNone.value = "";
    optNone.textContent = "— Sem disciplina —";
    selDisc.appendChild(optNone);
    var dm = disciplinaMap();
    Object.keys(dm).forEach(function (key) {
      var opt = document.createElement("option");
      opt.value = key;
      opt.textContent = dm[key].nome;
      if (existing && existing.disciplinaId === key) opt.selected = true;
      selDisc.appendChild(opt);
    });
    form.appendChild(field("Disciplina", selDisc));

    var inValor = makeInput("text", existing ? brlInput(existing.valor) : "");
    inValor.placeholder = "0,00";
    inValor.inputMode = "decimal";
    form.appendChild(field("Valor (R$)", inValor));

    // Status.
    var selStatus = document.createElement("select");
    var current = existing && isStatusValido(existing.status) ? existing.status : "a_contratar";
    STATUSES.forEach(function (st) {
      var opt = document.createElement("option");
      opt.value = st.id;
      opt.textContent = st.label;
      if (st.id === current) opt.selected = true;
      selStatus.appendChild(opt);
    });
    form.appendChild(field("Status", selStatus));

    var inContato = makeInput("text", existing ? existing.contato || "" : "");
    inContato.placeholder = "E-mail / telefone";
    form.appendChild(field("Contato", inContato, true));

    var taObs = document.createElement("textarea");
    taObs.value = existing ? existing.observacao || "" : "";
    taObs.placeholder = "Observações";
    form.appendChild(field("Observação", taObs, true));

    // Proposta (arquivo) — guardada como dataUrl no localStorage (máx. 1,5 MB).
    var propAtual = existing && existing.proposta ? existing.proposta : null;
    var inProp = makeInput("file");
    var propField = field("Proposta (arquivo)", inProp, true);
    var propInfo = el("div", "ctr-anexo-info");
    function pintaProp() {
      while (propInfo.firstChild) propInfo.removeChild(propInfo.firstChild);
      if (propAtual && propAtual.nome) {
        propInfo.appendChild(el("span", "muted-text", "Anexada: " + propAtual.nome + "  "));
        var rm = el("button", "btn btn-ghost sm", "remover");
        rm.type = "button";
        rm.addEventListener("click", function () {
          propAtual = null;
          inProp.value = "";
          pintaProp();
        });
        propInfo.appendChild(rm);
      }
    }
    inProp.addEventListener("change", function () {
      var f = inProp.files && inProp.files[0];
      if (!f) return;
      if (f.size > 1.5 * 1024 * 1024) {
        window.alert("Arquivo muito grande (máx. 1,5 MB para anexar no navegador).");
        inProp.value = "";
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        propAtual = { nome: f.name, dataUrl: String(reader.result) };
        pintaProp();
      };
      reader.readAsDataURL(f);
    });
    propField.appendChild(propInfo);
    form.appendChild(propField);
    pintaProp();

    var actions = el("div", "ctr-form-actions");
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
      var values = {
        nome: inNome.value.trim(),
        categoria: inCategoria.value.trim(),
        disciplinaId: selDisc.value || null,
        valor: parseBRL(inValor.value),
        status: isStatusValido(selStatus.value) ? selStatus.value : "a_contratar",
        contato: inContato.value.trim(),
        observacao: taObs.value.trim(),
        proposta: propAtual
      };
      upsertFornecedor(id, values);
      closeForm();
    });

    modal.appendChild(form);
    _backdrop.appendChild(modal);
    document.body.appendChild(_backdrop);
    document.addEventListener("keydown", onEscClose);
    inNome.focus();
  }

  /* ============================================================
     Cabeçalho padrão da aba (logo + título + cartão de contratos)
     ------------------------------------------------------------
     O cartão à direita mostra o nº total de contratos, com o nº de
     fechados como sublinha de contexto.
     ============================================================ */
  function buildHeader(fornecedores) {
    var Gestao = window.Gestao;
    var total = fornecedores.length;
    var nFechados = fornecedores.filter(function (f) {
      return (isStatusValido(f.status) ? f.status : "a_contratar") === "fechado";
    }).length;

    var right = Gestao.headerStat({
      label: "Contratos",
      value: String(total),
      sub: nFechados + (nFechados === 1 ? " fechado" : " fechados"),
      accent: true
    });

    return Gestao.pageHeader({
      eyebrow: "CONTRATAÇÕES · SUMMIT POA PMIRS 2026",
      title: "Fornecedores e contratos",
      subtitle: "Status das contratações por GT",
      right: right
    });
  }

  /* ============================================================
     Render principal
     ============================================================ */
  var _mount = null;

  function render() {
    if (!_mount) return;
    var fornecedores = getFornecedores();
    clear(_mount);

    // Cabeçalho padrão (estilo Cronograma) + cartão com nº de contratos.
    _mount.appendChild(buildHeader(fornecedores));

    var root = el("div", "stack");

    // Cabeçalho com botão de adicionar.
    var bar = el("div", "spread");
    bar.appendChild(el("span", "muted-text", "Arraste pelo status usando o seletor de cada card."));
    var addBtn = el("button", "btn btn-primary sm", "+ Fornecedor");
    addBtn.type = "button";
    addBtn.addEventListener("click", function () { openForm(null); });
    bar.appendChild(addBtn);
    root.appendChild(bar);

    root.appendChild(renderResumo(fornecedores));

    if (!fornecedores.length) {
      root.appendChild(Gestao.emptyState("Nenhum fornecedor cadastrado.", "+ Fornecedor", function () { openForm(null); }));
    } else {
      root.appendChild(renderKanban(fornecedores));
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

  if (window.Gestao && typeof window.Gestao.onTab === "function") {
    window.Gestao.onTab(TAB_ID, init);
  } else {
    document.addEventListener("DOMContentLoaded", function () {
      if (window.Gestao && typeof window.Gestao.onTab === "function") {
        window.Gestao.onTab(TAB_ID, init);
      }
    });
  }

  // Exposto para testes headless.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      computeResumo: computeResumo,
      groupByStatus: groupByStatus,
      isStatusValido: isStatusValido,
      parseBRL: parseBRL,
      brlInput: brlInput
    };
  }
})();
