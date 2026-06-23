/* ============================================================
   financeiro.js — Módulo Financeiro (aba "Financeiro")
   ------------------------------------------------------------
   Painel financeiro do evento:
   - Cards de resumo (previsto/realizado de receita e despesa,
     saldo com cor condicional, % de receita realizada).
   - Tabelas editáveis de receitas e despesas (agrupadas por
     categoria, com subtotais e linha de total).
   - Barras simples "orçado × realizado".
   - CRUD completo (modal) persistido via Gestao.save().

   Contrato consumido (definido em app.js / window.Gestao):
     Gestao.data.financeiro = { receitas:[...], despesas:[...] }
     Gestao.fmtBRL(n) · Gestao.fmtData(iso) · Gestao.uid(prefix)
     Gestao.save() · Gestao.onTab(id, renderFn)

   Segurança: todo dado do usuário entra no DOM via textContent
   ou .value — nunca via innerHTML. innerHTML só p/ markup fixo.
   ============================================================ */

(function () {
  "use strict";

  var TAB_ID = "tab-financeiro";

  /* ============================================================
     Injeção do CSS do módulo (sem tocar no index.html)
     ============================================================ */
  function ensureStyles() {
    var HREF = "css/financeiro.css";
    var found = false;
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    links.forEach(function (l) {
      if (l.getAttribute("href") === HREF) found = true;
    });
    if (found) return;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = HREF;
    document.head.appendChild(link);
  }

  /* ============================================================
     Helpers de número (parse pt-BR robusto)
     ============================================================ */

  // Converte um valor para número finito >= 0 não é forçado;
  // apenas garante um Number válido (0 em caso de lixo).
  function toNumber(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  // Faz o parse de um texto digitado no formato pt-BR.
  // Aceita "1.234,50", "1234,5", "1234.5", "R$ 1.000", "" → 0.
  function parseBRL(text) {
    if (text === null || text === undefined) return 0;
    var s = String(text).trim();
    if (s === "") return 0;
    // remove tudo que não for dígito, vírgula, ponto ou sinal
    s = s.replace(/[^0-9.,-]/g, "");
    if (s === "" || s === "-") return 0;

    var hasComma = s.indexOf(",") !== -1;
    var hasDot = s.indexOf(".") !== -1;

    if (hasComma && hasDot) {
      // Formato pt-BR: ponto = milhar, vírgula = decimal.
      s = s.replace(/\./g, "").replace(",", ".");
    } else if (hasComma) {
      // Só vírgula → decimal pt-BR.
      s = s.replace(",", ".");
    } else if (hasDot && /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
      // Só ponto(s) em grupos de 3 dígitos (ex.: "1.000", "2.500.000")
      // → separador de milhar pt-BR, não decimal.
      s = s.replace(/\./g, "");
    }
    // Demais casos com ponto (ex.: "1234.5") → decimal já parseável.
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  // Soma uma propriedade numérica sobre um array de itens.
  function sumBy(items, prop) {
    return (items || []).reduce(function (acc, it) {
      return acc + toNumber(it[prop]);
    }, 0);
  }

  /* ============================================================
     Helpers de DOM (seguros: textContent, não innerHTML)
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
     Acesso aos dados (sempre com fallback seguro)
     ============================================================ */
  function getFin() {
    var data = (window.Gestao && window.Gestao.data) || {};
    var fin = data.financeiro || {};
    if (!Array.isArray(fin.receitas)) fin.receitas = [];
    if (!Array.isArray(fin.despesas)) fin.despesas = [];
    data.financeiro = fin; // garante a referência
    if (window.Gestao) window.Gestao.data = data;
    return fin;
  }

  /* ============================================================
     Cálculo dos totais (KPIs)
     ============================================================ */
  function computeTotals(fin) {
    var recPrev = sumBy(fin.receitas, "previsto");
    var recReal = sumBy(fin.receitas, "realizado");
    var despPrev = sumBy(fin.despesas, "previsto");
    var despReal = sumBy(fin.despesas, "realizado");
    return {
      recPrev: recPrev,
      recReal: recReal,
      despPrev: despPrev,
      despReal: despReal,
      saldoPrev: recPrev - despPrev,
      saldoReal: recReal - despReal,
      pctReceita: recPrev > 0 ? (recReal / recPrev) * 100 : 0
    };
  }

  /* ============================================================
     Card de KPI
     ============================================================ */
  function kpiCard(opts) {
    // opts: { topClass, label, value, sub, valueClass }
    var card = el("div", "card fin-kpi-card" + (opts.topClass ? " " + opts.topClass : ""));
    var box = el("div", "fin-kpi" + (opts.valueClass ? " " + opts.valueClass : ""));
    box.appendChild(el("span", "fin-kpi-label", opts.label));
    box.appendChild(el("span", "fin-kpi-value", opts.value));
    if (opts.sub) box.appendChild(el("span", "fin-kpi-sub", opts.sub));
    card.appendChild(box);
    return card;
  }

  function renderResumo(fin) {
    var t = computeTotals(fin);
    var Gestao = window.Gestao;

    var wrap = el("div", "stack");
    var grid = el("div", "grid cols-4");

    grid.appendChild(
      kpiCard({
        topClass: "t-receita",
        label: "Receita prevista",
        value: Gestao.fmtBRL(t.recPrev),
        sub: "realizado: " + Gestao.fmtBRL(t.recReal),
        valueClass: "is-receita"
      })
    );
    grid.appendChild(
      kpiCard({
        topClass: "t-despesa",
        label: "Despesa prevista",
        value: Gestao.fmtBRL(t.despPrev),
        sub: "realizado: " + Gestao.fmtBRL(t.despReal),
        valueClass: "is-despesa"
      })
    );
    grid.appendChild(
      kpiCard({
        topClass: "t-saldo",
        label: "Saldo previsto",
        value: Gestao.fmtBRL(t.saldoPrev),
        sub: "saldo realizado: " + Gestao.fmtBRL(t.saldoReal),
        valueClass: t.saldoPrev >= 0 ? "is-positivo" : "is-negativo"
      })
    );
    grid.appendChild(
      kpiCard({
        topClass: "t-receita",
        label: "% receita realizada",
        value: t.pctReceita.toFixed(1).replace(".", ",") + "%",
        sub:
          Gestao.fmtBRL(t.recReal) +
          " de " +
          Gestao.fmtBRL(t.recPrev),
        valueClass: "is-destaque"
      })
    );

    wrap.appendChild(grid);

    // Barras orçado × realizado (receita e despesa).
    var barsCard = el("div", "card stack");
    barsCard.appendChild(el("h3", "section-title", "Orçado × realizado"));
    barsCard.appendChild(barRow("Receitas", t.recReal, t.recPrev, "t-receita"));
    barsCard.appendChild(barRow("Despesas", t.despReal, t.despPrev, "t-despesa"));
    wrap.appendChild(barsCard);

    return wrap;
  }

  // Uma linha "rótulo + barra + legenda".
  function barRow(label, realizado, previsto, typeClass) {
    var Gestao = window.Gestao;
    var row = el("div", "stack");
    var top = el("div", "spread");
    top.appendChild(el("strong", null, label));
    var pct = previsto > 0 ? Math.min(100, (realizado / previsto) * 100) : 0;
    top.appendChild(
      el(
        "span",
        "fin-bar-caption",
        Gestao.fmtBRL(realizado) + " / " + Gestao.fmtBRL(previsto)
      )
    );
    row.appendChild(top);

    var bar = el("div", "fin-bar " + typeClass);
    var fill = el("span");
    fill.style.width = pct.toFixed(1) + "%";
    bar.appendChild(fill);
    row.appendChild(bar);
    return row;
  }

  /* ============================================================
     Tabela editável (receitas ou despesas)
     ------------------------------------------------------------
     Agrupa por categoria, mostra subtotais e linha de total.
     "kind" = "receita" | "despesa" (controla colunas e CRUD).
     ============================================================ */
  function renderTabela(fin, kind) {
    var isDesp = kind === "despesa";
    var items = isDesp ? fin.despesas : fin.receitas;
    var Gestao = window.Gestao;

    var card = el("div", "card stack");

    // Cabeçalho com botão "adicionar".
    var head = el("div", "spread");
    var title = el("h3", "section-title", isDesp ? "Despesas" : "Receitas");
    head.appendChild(title);
    var addBtn = el("button", "btn btn-primary sm", isDesp ? "+ Despesa" : "+ Receita");
    addBtn.type = "button";
    addBtn.addEventListener("click", function () {
      openForm(kind, null);
    });
    head.appendChild(addBtn);
    card.appendChild(head);

    if (!items.length) {
      card.appendChild(
        el(
          "div",
          "empty",
          isDesp
            ? "Nenhuma despesa cadastrada. Use “+ Despesa”."
            : "Nenhuma receita cadastrada. Use “+ Receita”."
        )
      );
      return card;
    }

    var wrap = el("div", "fin-table-wrap");
    var table = el("table", "table compact");

    // Cabeçalho de colunas.
    var thead = el("thead");
    var trh = el("tr");
    var cols = ["Descrição", "Previsto", "Realizado", "Data"];
    if (isDesp) cols.push("Fornecedor");
    cols.push("");
    cols.forEach(function (c, i) {
      var th = el("th", null, c);
      // colunas numéricas alinhadas à direita
      if (i === 1 || i === 2) th.className = "num";
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);

    var tbody = el("tbody");
    var colSpan = cols.length;

    // Agrupa por categoria preservando a ordem de aparição.
    var groups = groupByCategoria(items);

    groups.order.forEach(function (cat) {
      var rows = groups.map[cat];

      // Linha de cabeçalho do grupo.
      var gTr = el("tr", "fin-group-row");
      var gTd = el("td", null, cat || "Sem categoria");
      gTd.colSpan = colSpan;
      gTr.appendChild(gTd);
      tbody.appendChild(gTr);

      // Linhas de itens.
      rows.forEach(function (it) {
        tbody.appendChild(buildItemRow(it, kind, isDesp));
      });

      // Subtotal do grupo.
      tbody.appendChild(buildSubtotalRow(rows, isDesp, colSpan));
    });

    // Total geral.
    tbody.appendChild(buildTotalRow(items, isDesp, colSpan));

    table.appendChild(tbody);
    wrap.appendChild(table);
    card.appendChild(wrap);
    return card;
  }

  // Agrupa itens por categoria mantendo a ordem em que surgem.
  function groupByCategoria(items) {
    var map = {};
    var order = [];
    items.forEach(function (it) {
      var cat = it.categoria || "Sem categoria";
      if (!map[cat]) {
        map[cat] = [];
        order.push(cat);
      }
      map[cat].push(it);
    });
    return { map: map, order: order };
  }

  function buildItemRow(it, kind, isDesp) {
    var Gestao = window.Gestao;
    var tr = el("tr");

    tr.appendChild(el("td", null, it.descricao || "—"));

    var tdPrev = el("td", "num", Gestao.fmtBRL(it.previsto));
    tr.appendChild(tdPrev);

    var tdReal = el("td", "num", Gestao.fmtBRL(it.realizado));
    tr.appendChild(tdReal);

    tr.appendChild(el("td", null, it.data ? Gestao.fmtData(it.data) : "—"));

    if (isDesp) {
      tr.appendChild(el("td", null, it.fornecedor || "—"));
    }

    // Ações.
    var tdAct = el("td");
    var actions = el("div", "fin-actions");

    var edit = el("button", "btn btn-ghost sm", "Editar");
    edit.type = "button";
    edit.addEventListener("click", function () {
      openForm(kind, it.id);
    });
    actions.appendChild(edit);

    var del = el("button", "btn btn-ghost sm", "Excluir");
    del.type = "button";
    del.addEventListener("click", function () {
      removeItem(kind, it.id, it.descricao);
    });
    actions.appendChild(del);

    tdAct.appendChild(actions);
    tr.appendChild(tdAct);
    return tr;
  }

  function buildSubtotalRow(rows, isDesp, colSpan) {
    var Gestao = window.Gestao;
    var tr = el("tr");
    var tdLabel = el("td", "muted-text", "Subtotal");
    tr.appendChild(tdLabel);
    tr.appendChild(el("td", "num", Gestao.fmtBRL(sumBy(rows, "previsto"))));
    tr.appendChild(el("td", "num", Gestao.fmtBRL(sumBy(rows, "realizado"))));
    // células restantes vazias (data, fornecedor?, ações)
    var rest = colSpan - 3;
    for (var i = 0; i < rest; i++) tr.appendChild(el("td", null, ""));
    return tr;
  }

  function buildTotalRow(items, isDesp, colSpan) {
    var Gestao = window.Gestao;
    var tr = el("tr", "fin-total-row");
    tr.appendChild(el("td", null, "Total"));
    tr.appendChild(el("td", "num", Gestao.fmtBRL(sumBy(items, "previsto"))));
    tr.appendChild(el("td", "num", Gestao.fmtBRL(sumBy(items, "realizado"))));
    var rest = colSpan - 3;
    for (var i = 0; i < rest; i++) tr.appendChild(el("td", null, ""));
    return tr;
  }

  /* ============================================================
     CRUD — operações sobre Gestao.data.financeiro
     ============================================================ */
  function listFor(kind) {
    var fin = getFin();
    return kind === "despesa" ? fin.despesas : fin.receitas;
  }

  function findItem(kind, id) {
    var list = listFor(kind);
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function upsertItem(kind, id, values) {
    var list = listFor(kind);
    if (id) {
      // Edição: substitui pelo novo objeto (imutável na entrada).
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) {
          list[i] = Object.assign({}, list[i], values, { id: id });
          break;
        }
      }
    } else {
      // Criação.
      var novo = Object.assign({ id: window.Gestao.uid(kind === "despesa" ? "d" : "r") }, values);
      list.push(novo);
    }
    window.Gestao.save();
    render(); // re-renderiza a aba inteira
  }

  function removeItem(kind, id, descricao) {
    var label = descricao ? '"' + descricao + '"' : "este item";
    if (!window.confirm("Excluir " + label + "?")) return;
    var fin = getFin();
    if (kind === "despesa") {
      fin.despesas = fin.despesas.filter(function (x) { return x.id !== id; });
    } else {
      fin.receitas = fin.receitas.filter(function (x) { return x.id !== id; });
    }
    window.Gestao.save();
    render();
  }

  /* ============================================================
     Formulário de edição (modal)
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
    var wrap = el("div", "fin-field" + (full ? " full" : ""));
    var id = "fin-f-" + window.Gestao.uid("x");
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

  // Categorias já usadas no tipo (receita/despesa), distintas e ordenadas.
  function categoriasExistentes(kind) {
    var fin = (window.Gestao.data && window.Gestao.data.financeiro) || {};
    var arr = (kind === "despesa" ? fin.despesas : fin.receitas) || [];
    var vistos = {};
    arr.forEach(function (it) {
      var c = (it.categoria || "").trim();
      if (c) vistos[c] = true;
    });
    return Object.keys(vistos).sort(function (a, b) {
      return a.localeCompare(b, "pt-BR");
    });
  }

  function openForm(kind, id) {
    var isDesp = kind === "despesa";
    var existing = id ? findItem(kind, id) : null;
    var Gestao = window.Gestao;

    closeForm(); // fecha qualquer modal aberto antes

    _backdrop = el("div", "fin-modal-backdrop");
    _backdrop.addEventListener("click", function (e) {
      if (e.target === _backdrop) closeForm();
    });

    var modal = el("div", "fin-modal");
    var titulo =
      (existing ? "Editar " : "Nova ") + (isDesp ? "despesa" : "receita");
    modal.appendChild(el("h3", "section-title", titulo));

    var form = document.createElement("form");
    form.className = "fin-form";

    // Campos.
    // Categoria: select com as existentes + opção de criar nova.
    var cats = categoriasExistentes(kind);
    var selCat = document.createElement("select");
    cats.forEach(function (c) {
      var o = document.createElement("option");
      o.value = c;
      o.textContent = c;
      selCat.appendChild(o);
    });
    var optNova = document.createElement("option");
    optNova.value = "__nova__";
    optNova.textContent = "+ Nova categoria…";
    selCat.appendChild(optNova);

    var inNovaCat = makeInput("text", "");
    inNovaCat.placeholder = isDesp ? "Ex.: Audiovisual" : "Ex.: Ingressos";
    inNovaCat.style.marginTop = "8px";
    inNovaCat.classList.add("hidden");

    var catAtual = existing ? (existing.categoria || "").trim() : "";
    if (catAtual && cats.indexOf(catAtual) >= 0) {
      selCat.value = catAtual;
    } else if (catAtual) {
      var oExtra = document.createElement("option");
      oExtra.value = catAtual;
      oExtra.textContent = catAtual;
      selCat.insertBefore(oExtra, optNova);
      selCat.value = catAtual;
    } else if (!cats.length) {
      selCat.value = "__nova__";
      inNovaCat.classList.remove("hidden");
    }

    selCat.addEventListener("change", function () {
      var nova = selCat.value === "__nova__";
      inNovaCat.classList.toggle("hidden", !nova);
      if (nova) inNovaCat.focus();
    });

    function getCategoria() {
      return selCat.value === "__nova__" ? inNovaCat.value.trim() : selCat.value;
    }

    var catWrap = field("Categoria", selCat);
    catWrap.appendChild(inNovaCat);
    form.appendChild(catWrap);

    var inDescricao = makeInput("text", existing ? existing.descricao : "");
    inDescricao.placeholder = "Descrição do item";
    inDescricao.required = true;
    form.appendChild(field("Descrição", inDescricao, true));

    var inPrevisto = makeInput("text", existing ? brlInput(existing.previsto) : "");
    inPrevisto.placeholder = "0,00";
    inPrevisto.inputMode = "decimal";
    form.appendChild(field("Previsto (R$)", inPrevisto));

    var inRealizado = makeInput("text", existing ? brlInput(existing.realizado) : "");
    inRealizado.placeholder = "0,00";
    inRealizado.inputMode = "decimal";
    form.appendChild(field("Realizado (R$)", inRealizado));

    var inData = makeInput("date", existing && existing.data ? isoDate(existing.data) : "");
    form.appendChild(field("Data", inData));

    var inFornecedor = null;
    if (isDesp) {
      inFornecedor = makeInput("text", existing ? existing.fornecedor || "" : "");
      inFornecedor.placeholder = "Fornecedor (opcional)";
      form.appendChild(field("Fornecedor", inFornecedor));
    }

    // Ações.
    var actions = el("div", "fin-form-actions");
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
      var descricao = inDescricao.value.trim();
      if (!descricao) {
        inDescricao.focus();
        return;
      }
      var values = {
        categoria: getCategoria(),
        descricao: descricao,
        previsto: parseBRL(inPrevisto.value),
        realizado: parseBRL(inRealizado.value),
        data: inData.value ? inData.value : null
      };
      if (isDesp) {
        values.fornecedor = inFornecedor.value.trim() || null;
      }
      upsertItem(kind, id, values);
      closeForm();
    });

    modal.appendChild(form);
    _backdrop.appendChild(modal);
    document.body.appendChild(_backdrop);
    document.addEventListener("keydown", onEscClose);
    inDescricao.focus();
  }

  // Valor numérico → string para <input> (vírgula decimal pt-BR).
  function brlInput(n) {
    var v = toNumber(n);
    if (v === 0) return "";
    return String(v).replace(".", ",");
  }

  // Normaliza uma data (ISO completo ou YYYY-MM-DD) para o
  // formato aceito por <input type="date"> (YYYY-MM-DD).
  function isoDate(v) {
    var s = String(v);
    var m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : "";
  }

  /* ============================================================
     Render principal da aba
     ============================================================ */
  var _mount = null;

  function render() {
    if (!_mount) return;
    var fin = getFin();
    clear(_mount);

    var root = el("div", "stack");

    // Título da seção.
    var titleWrap = el("h2", "section-title", "Financeiro");
    var sub = el("span", "sub", "Receitas, despesas e saldo do evento");
    titleWrap.appendChild(sub);
    root.appendChild(titleWrap);

    root.appendChild(renderResumo(fin));
    root.appendChild(renderTabela(fin, "receita"));
    root.appendChild(renderTabela(fin, "despesa"));

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
    // app.js ainda não carregou: tenta novamente quando o DOM estiver pronto.
    document.addEventListener("DOMContentLoaded", function () {
      if (window.Gestao && typeof window.Gestao.onTab === "function") {
        window.Gestao.onTab(TAB_ID, init);
      }
    });
  }

  // Exposto para testes headless (Node não tem window.Gestao real).
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      parseBRL: parseBRL,
      toNumber: toNumber,
      sumBy: sumBy,
      computeTotals: computeTotals,
      groupByCategoria: groupByCategoria,
      brlInput: brlInput,
      isoDate: isoDate
    };
  }
})();
