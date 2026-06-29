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
     Contratos fechados lidos como despesas somente-leitura
     ============================================================ */
  function getContratosFechados() {
    var g = window.Gestao;
    if (!g) return [];
    var lista = (g.data.contratacoes && g.data.contratacoes.fornecedores) || [];
    return lista.filter(function (f) { return f.status === "fechado"; });
  }

  function somaDesembolsos(f) {
    var arr = Array.isArray(f.desembolsos) ? f.desembolsos : [];
    return arr.reduce(function (s, d) {
      var prev = toNumber(d.previsto !== undefined ? d.previsto : d.valor);
      return { previsto: s.previsto + prev, realizado: s.realizado + toNumber(d.realizado) };
    }, { previsto: 0, realizado: 0 });
  }

  function contratosComoItens() {
    return getContratosFechados().map(function (f) {
      var s = somaDesembolsos(f);
      return {
        id: "ctr-" + f.id,
        descricao: f.nome || "Contrato",
        categoria: f.categoria || "Contratos",
        previsto: s.previsto,
        realizado: s.realizado,
        fornecedor: f.nome,
        data: f.dataCriacao || null,
        _isContrato: true
      };
    });
  }

  /* ============================================================
     Cálculo dos totais (KPIs)
     ============================================================ */
  function computeTotals(fin) {
    var somaCtr = getContratosFechados().reduce(function (s, f) {
      var d = somaDesembolsos(f);
      return { previsto: s.previsto + d.previsto, realizado: s.realizado + d.realizado };
    }, { previsto: 0, realizado: 0 });
    var ins = getInscricoes();
    var recPrev = calcInscricoesPrev(ins);
    var recReal = calcInscricroesReal(ins);
    var despPrev = sumBy(fin.despesas, "previsto") + somaCtr.previsto;
    var despReal = sumBy(fin.despesas, "realizado") + somaCtr.realizado;
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
    var despCard = kpiCard({
      topClass: "t-despesa",
      label: "Despesa prevista",
      value: Gestao.fmtBRL(t.despPrev),
      sub: "realizado: " + Gestao.fmtBRL(t.despReal),
      valueClass: "is-despesa"
    });
    // Func-16: badge de desvio se realizado > previsto * 1,10
    if (t.despPrev > 0 && t.despReal > t.despPrev * 1.10) {
      var pctDesvio = Math.round((t.despReal / t.despPrev - 1) * 100);
      var badge = el("span", "badge", "⚠ +" + pctDesvio + "%");
      badge.style.background = "#E0611F";
      badge.style.color = "#fff";
      badge.style.padding = "2px 8px";
      badge.style.borderRadius = "4px";
      badge.style.fontSize = "12px";
      badge.style.marginLeft = "8px";
      var kpiBox = despCard.querySelector(".fin-kpi");
      if (kpiBox) kpiBox.appendChild(badge);
    }
    grid.appendChild(despCard);
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
    var manualItems = isDesp ? fin.despesas : fin.receitas;
    var Gestao = window.Gestao;

    /* Mescla contratos fechados nas despesas */
    var items = isDesp
      ? manualItems.concat(contratosComoItens())
      : manualItems;

    var card = el("div", "card stack");

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
      var emptyKind = kind;
      card.appendChild(
        Gestao.emptyState(
          isDesp ? "Nenhuma despesa cadastrada." : "Nenhuma receita cadastrada.",
          isDesp ? "+ Despesa" : "+ Receita",
          function () { openForm(emptyKind, null); }
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

    // Ações (contratos são somente-leitura).
    var tdAct = el("td");
    if (it._isContrato) {
      var badge = el("span", null, "Contrato");
      badge.style.cssText = "font-size:.75rem;font-weight:600;color:#36177B;background:#ede9f8;border:1px solid #c4b8e8;padding:2px 8px;border-radius:20px;white-space:nowrap;";
      tdAct.appendChild(badge);
    } else {
      var actions = el("div", "fin-actions");
      var edit = el("button", "btn btn-ghost sm", "Editar");
      edit.type = "button";
      edit.addEventListener("click", function () { openForm(kind, it.id); });
      actions.appendChild(edit);
      var del = el("button", "btn btn-ghost sm", "Excluir");
      del.type = "button";
      del.addEventListener("click", function () { removeItem(kind, it.id, it.descricao); });
      actions.appendChild(del);
      tdAct.appendChild(actions);
    }
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
    window.Gestao.toast("Item salvo");
    render(); // re-renderiza a aba inteira
  }

  function removeItem(kind, id, descricao) {
    var label = descricao ? '"' + descricao + '"' : "este item";
    window.Gestao.confirm("Excluir " + label + "?", function () {
      var fin = getFin();
      if (kind === "despesa") {
        fin.despesas = fin.despesas.filter(function (x) { return x.id !== id; });
      } else {
        fin.receitas = fin.receitas.filter(function (x) { return x.id !== id; });
      }
      window.Gestao.save();
      window.Gestao.toast("Item removido");
      render();
    });
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
      void e; /* clicar fora NÃO fecha (evita perda acidental); use Cancelar ou Esc */
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
    window.Gestao.maskBRL(inPrevisto);

    var inRealizado = makeInput("text", existing ? brlInput(existing.realizado) : "");
    inRealizado.placeholder = "0,00";
    inRealizado.inputMode = "decimal";
    form.appendChild(field("Realizado (R$)", inRealizado));
    window.Gestao.maskBRL(inRealizado);

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
     Inscricoes — plano de receitas (ingressos + patrocinio)
     ============================================================ */
  var DEFAULT_INSCRICOES = {
    cegas: {
      label: "PMI-RS Summit 2026 - Lote Blind (Venda as Cegas) - CBGPL",
      valor: 259, qtd_prev: 20, qtd_real: 0
    },
    lotes: [
      { num: 1, tipos: [
        { tipo: "Geral",      valor: 640, qtd_prev: 5,  qtd_real: 0 },
        { tipo: "Estudante",  valor: 480, qtd_prev: 4,  qtd_real: 0 },
        { tipo: "Filiado",    valor: 384, qtd_prev: 8,  qtd_real: 0 },
        { tipo: "Voluntario", valor: 320, qtd_prev: 8,  qtd_real: 0 }
      ]},
      { num: 2, tipos: [
        { tipo: "Geral",      valor: 740, qtd_prev: 10, qtd_real: 0 },
        { tipo: "Estudante",  valor: 555, qtd_prev: 6,  qtd_real: 0 },
        { tipo: "Filiado",    valor: 444, qtd_prev: 14, qtd_real: 0 },
        { tipo: "Voluntario", valor: 370, qtd_prev: 4,  qtd_real: 0 }
      ]},
      { num: 3, tipos: [
        { tipo: "Geral",      valor: 860, qtd_prev: 10, qtd_real: 0 },
        { tipo: "Estudante",  valor: 645, qtd_prev: 8,  qtd_real: 0 },
        { tipo: "Filiado",    valor: 516, qtd_prev: 14, qtd_real: 0 },
        { tipo: "Voluntario", valor: 430, qtd_prev: 4,  qtd_real: 0 }
      ]},
      { num: 4, tipos: [
        { tipo: "Geral",      valor: 960, qtd_prev: 30, qtd_real: 0 },
        { tipo: "Estudante",  valor: 720, qtd_prev: 8,  qtd_real: 0 },
        { tipo: "Filiado",    valor: 576, qtd_prev: 35, qtd_real: 0 },
        { tipo: "Voluntario", valor: 480, qtd_prev: 8,  qtd_real: 0 }
      ]}
    ],
    patrocinio: [
      { cota: "Diamante", valor: 0, qtd_prev: 0 },
      { cota: "Premium",  valor: 0, qtd_prev: 0 },
      { cota: "Master",   valor: 0, qtd_prev: 0 }
    ]
  };

  function getInscricoes() {
    var data = (window.Gestao && window.Gestao.data) || {};
    var fin = data.financeiro || {};
    if (!fin.inscricoes) {
      fin.inscricoes = JSON.parse(JSON.stringify(DEFAULT_INSCRICOES));
      data.financeiro = fin;
      if (window.Gestao) window.Gestao.data = data;
    } else {
      reconcilePatrocinioCotas(fin.inscricoes);
    }
    return fin.inscricoes;
  }

  // Alinha a lista de cotas de patrocinio com o conjunto canonico
  // (DEFAULT_INSCRICOES.patrocinio), preservando valores ja digitados
  // por cota que sobrevive. Trata blobs antigos com cotas removidas.
  function reconcilePatrocinioCotas(ins) {
    var canon = DEFAULT_INSCRICOES.patrocinio.map(function (p) { return p.cota; });
    var atual = Array.isArray(ins.patrocinio) ? ins.patrocinio : [];
    var byCota = {};
    atual.forEach(function (p) { byCota[p.cota] = p; });
    var precisaTrocar = atual.length !== canon.length ||
      canon.some(function (c) { return !byCota[c]; });
    if (!precisaTrocar) return;
    ins.patrocinio = canon.map(function (c) {
      var prev = byCota[c];
      return prev
        ? { cota: c, valor: toNumber(prev.valor), qtd_prev: toNumber(prev.qtd_prev) }
        : { cota: c, valor: 0, qtd_prev: 0 };
    });
  }

  function calcInscricoesPrev(ins) {
    var t = ins.cegas ? toNumber(ins.cegas.valor) * toNumber(ins.cegas.qtd_prev) : 0;
    (ins.lotes || []).forEach(function (l) {
      (l.tipos || []).forEach(function (tp) { t += toNumber(tp.valor) * toNumber(tp.qtd_prev); });
    });
    (ins.patrocinio || []).forEach(function (p) { t += toNumber(p.valor) * toNumber(p.qtd_prev); });
    return t;
  }

  function calcInscricroesReal(ins) {
    var t = ins.cegas ? toNumber(ins.cegas.valor) * toNumber(ins.cegas.qtd_real) : 0;
    (ins.lotes || []).forEach(function (l) {
      (l.tipos || []).forEach(function (tp) { t += toNumber(tp.valor) * toNumber(tp.qtd_real); });
    });
    (ins.patrocinio || []).forEach(function (p) {
      t += toNumber(p.valor) * getPatroCotaConfirmado(p.cota);
    });
    return t;
  }

  function getPatroCotaConfirmado(cotaNome) {
    var g = window.Gestao;
    if (!g) return 0;
    var lista = (g.data.patrocinio && g.data.patrocinio.patrocinadores) || [];
    var cmp = cotaNome.toLowerCase();
    return lista.filter(function (p) { return p.status === "confirmado" && p.cota === cmp; }).length;
  }

  function renderInscricoes() {
    var Gestao = window.Gestao;
    var ins = getInscricoes();
    var card = el("div", "card stack");
    card.appendChild(el("h3", "section-title", "Receitas -- Inscricoes e Patrocinio"));

    var CS = "font-size:.78rem;padding:4px 8px;border-bottom:1px solid var(--line);";
    var HS = "font-size:.72rem;color:var(--muted);font-weight:600;padding:3px 8px;";

    function numInp(val, onchange) {
      var inp = document.createElement("input");
      inp.type = "number";
      inp.value = val;
      inp.min = "0";
      inp.style.cssText = "width:58px;border:1px solid transparent;border-radius:3px;background:transparent;font:inherit;text-align:right;padding:1px 3px;";
      inp.addEventListener("focus", function () { inp.style.borderColor = "var(--purple,#6d28d9)"; inp.style.background = "var(--card)"; });
      inp.addEventListener("blur",  function () { inp.style.borderColor = "transparent"; inp.style.background = "transparent"; });
      inp.addEventListener("change", function () { onchange(toNumber(inp.value)); Gestao.save(); updateGrand(); });
      return inp;
    }

    // Campo de valor com mascara de moeda (R$ X.XXX,XX) ao digitar.
    function moneyInp(val, onchange) {
      var inp = document.createElement("input");
      inp.type = "text";
      inp.inputMode = "numeric";
      inp.style.cssText = "width:96px;border:1px solid transparent;border-radius:3px;background:transparent;font:inherit;text-align:right;padding:1px 4px;";
      function fmt(n) { return toNumber(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
      function parse() { var d = inp.value.replace(/\D/g, ""); return d ? parseInt(d, 10) / 100 : 0; }
      inp.value = fmt(val);
      inp.addEventListener("focus", function () { inp.style.borderColor = "var(--purple,#6d28d9)"; inp.style.background = "var(--card)"; });
      inp.addEventListener("input", function () { inp.value = fmt(parse()); });
      inp.addEventListener("blur",  function () { inp.style.borderColor = "transparent"; inp.style.background = "transparent"; });
      inp.addEventListener("change", function () { onchange(parse()); Gestao.save(); updateGrand(); });
      return inp;
    }

    function tdR(content, bold) {
      var td = document.createElement("td");
      td.style.cssText = CS + "text-align:right;" + (bold ? "font-weight:700;font-variant-numeric:tabular-nums;" : "color:var(--muted);");
      if (content && content.nodeName) td.appendChild(content);
      else td.textContent = String(content !== undefined ? content : "");
      return td;
    }

    function tdL(text, bold, colspan) {
      var td = document.createElement("td");
      td.style.cssText = CS + (bold ? "font-weight:600;" : "color:var(--muted);");
      if (colspan) td.colSpan = colspan;
      td.textContent = text;
      return td;
    }

    function mkTbl(hdrs) {
      var t = document.createElement("table");
      t.style.cssText = "width:100%;border-collapse:collapse;margin-bottom:14px;";
      var thead = document.createElement("thead");
      var hr = document.createElement("tr");
      hdrs.forEach(function (h, i) {
        var th = document.createElement("th");
        th.textContent = h;
        th.style.cssText = HS + (i === 0 ? "text-align:left;" : "text-align:right;");
        hr.appendChild(th);
      });
      thead.appendChild(hr);
      t.appendChild(thead);
      var tb = document.createElement("tbody");
      t.appendChild(tb);
      return { tbl: t, tbody: tb };
    }

    function subRow(label, colspan, prevEl, realEl) {
      var tr = document.createElement("tr");
      tr.style.background = "var(--surface,#f6f4fa)";
      var td = document.createElement("td");
      td.colSpan = colspan;
      td.style.cssText = CS + "border-top:2px solid var(--line);color:var(--muted);font-size:.72rem;font-style:italic;";
      td.textContent = label;
      prevEl.style.borderTop = "2px solid var(--line)";
      realEl.style.borderTop = "2px solid var(--line)";
      tr.appendChild(td);
      tr.appendChild(prevEl);
      tr.appendChild(realEl);
      return tr;
    }

    var gPrevEl = el("span", null, Gestao.fmtBRL(calcInscricoesPrev(ins)));
    var gRealEl = el("span", null, Gestao.fmtBRL(calcInscricroesReal(ins)));
    gPrevEl.style.fontWeight = "700";
    gRealEl.style.fontWeight = "700";

    function updateGrand() {
      gPrevEl.textContent = Gestao.fmtBRL(calcInscricoesPrev(ins));
      gRealEl.textContent = Gestao.fmtBRL(calcInscricroesReal(ins));
    }

    // --- Cegas ---
    var c = ins.cegas;
    var ct = mkTbl(["Categoria", "Valor/ing.", "Qtd Prev", "Qtd Real", "Total Prev", "Total Real"]);
    var cPE = tdR(Gestao.fmtBRL(toNumber(c.valor) * toNumber(c.qtd_prev)), true);
    var cRE = tdR(Gestao.fmtBRL(toNumber(c.valor) * toNumber(c.qtd_real)), false);
    var cRow = document.createElement("tr");
    cRow.appendChild(tdL(c.label || "Cegas", true));
    cRow.appendChild(tdR(moneyInp(c.valor, function (v) {
      c.valor = v;
      cPE.textContent = Gestao.fmtBRL(v * c.qtd_prev);
      cRE.textContent = Gestao.fmtBRL(v * c.qtd_real);
    })));
    cRow.appendChild(tdR(numInp(c.qtd_prev, function (v) {
      c.qtd_prev = v;
      cPE.textContent = Gestao.fmtBRL(c.valor * v);
    })));
    cRow.appendChild(tdR(numInp(c.qtd_real, function (v) {
      c.qtd_real = v;
      cRE.textContent = Gestao.fmtBRL(c.valor * v);
    })));
    cRow.appendChild(cPE);
    cRow.appendChild(cRE);
    ct.tbody.appendChild(cRow);
    card.appendChild(ct.tbl);

    // --- Lotes ---
    (ins.lotes || []).forEach(function (lote) {
      var lt = mkTbl(["Lote", "Tipo", "Valor/ing.", "Qtd Prev", "Qtd Real", "Total Prev", "Total Real"]);
      var lPE = tdR("", true);
      var lRE = tdR("", false);

      function updSub() {
        var sp = 0, sr = 0;
        lote.tipos.forEach(function (tp) {
          sp += toNumber(tp.valor) * toNumber(tp.qtd_prev);
          sr += toNumber(tp.valor) * toNumber(tp.qtd_real);
        });
        lPE.textContent = Gestao.fmtBRL(sp);
        lRE.textContent = Gestao.fmtBRL(sr);
      }
      updSub();

      (lote.tipos || []).forEach(function (tp, ti) {
        var tr = document.createElement("tr");
        var tPE = tdR(Gestao.fmtBRL(toNumber(tp.valor) * toNumber(tp.qtd_prev)), true);
        var tRE = tdR(Gestao.fmtBRL(toNumber(tp.valor) * toNumber(tp.qtd_real)), false);
        if (ti === 0) tr.appendChild(tdL("Lote " + lote.num, true));
        else { var bk = document.createElement("td"); bk.style.cssText = CS; tr.appendChild(bk); }
        tr.appendChild(tdL(tp.tipo, false));
        tr.appendChild(tdR(moneyInp(tp.valor, function (v) {
          tp.valor = v;
          tPE.textContent = Gestao.fmtBRL(v * tp.qtd_prev);
          tRE.textContent = Gestao.fmtBRL(v * tp.qtd_real);
          updSub();
        })));
        tr.appendChild(tdR(numInp(tp.qtd_prev, function (v) {
          tp.qtd_prev = v;
          tPE.textContent = Gestao.fmtBRL(tp.valor * v);
          updSub();
        })));
        tr.appendChild(tdR(numInp(tp.qtd_real, function (v) {
          tp.qtd_real = v;
          tRE.textContent = Gestao.fmtBRL(tp.valor * v);
          updSub();
        })));
        tr.appendChild(tPE);
        tr.appendChild(tRE);
        lt.tbody.appendChild(tr);
      });
      lt.tbody.appendChild(subRow("Subtotal Lote " + lote.num, 5, lPE, lRE));
      card.appendChild(lt.tbl);
    });

    // --- Patrocinio ---
    var pt = mkTbl(["Cota", "Valor/cota", "Qtd Prev", "Qtd Real*", "Total Prev", "Total Real*"]);
    var ptPE = tdR("", true);
    var ptRE = tdR("", false);

    function updPat() {
      var sp = 0, sr = 0;
      (ins.patrocinio || []).forEach(function (p) {
        sp += toNumber(p.valor) * toNumber(p.qtd_prev);
        sr += toNumber(p.valor) * getPatroCotaConfirmado(p.cota);
      });
      ptPE.textContent = Gestao.fmtBRL(sp);
      ptRE.textContent = Gestao.fmtBRL(sr);
    }
    updPat();

    (ins.patrocinio || []).forEach(function (p) {
      var qr = getPatroCotaConfirmado(p.cota);
      var pPE = tdR(Gestao.fmtBRL(toNumber(p.valor) * toNumber(p.qtd_prev)), true);
      var pRE = tdR(Gestao.fmtBRL(toNumber(p.valor) * qr), false);
      var tr = document.createElement("tr");
      tr.appendChild(tdL(p.cota, true));
      tr.appendChild(tdR(moneyInp(p.valor, function (v) {
        p.valor = v;
        pPE.textContent = Gestao.fmtBRL(v * p.qtd_prev);
        pRE.textContent = Gestao.fmtBRL(v * getPatroCotaConfirmado(p.cota));
        updPat();
      })));
      tr.appendChild(tdR(numInp(p.qtd_prev, function (v) {
        p.qtd_prev = v;
        pPE.textContent = Gestao.fmtBRL(p.valor * v);
        updPat();
      })));
      tr.appendChild(tdR(String(qr)));
      tr.appendChild(pPE);
      tr.appendChild(pRE);
      pt.tbody.appendChild(tr);
    });
    var notaTd = document.createElement("td");
    notaTd.colSpan = 6;
    notaTd.style.cssText = CS + "font-size:.7rem;color:var(--muted);font-style:italic;";
    notaTd.textContent = "* Qtd Real derivado automaticamente de patrocinadores com status Confirmado.";
    var notaTr = document.createElement("tr");
    notaTr.appendChild(notaTd);
    pt.tbody.appendChild(notaTr);
    pt.tbody.appendChild(subRow("Subtotal Patrocinio", 4, ptPE, ptRE));
    card.appendChild(pt.tbl);

    // --- Total Geral ---
    var tw = el("div", "spread");
    tw.style.cssText = "padding:10px 0 4px;border-top:2px solid var(--line);";
    var tl = el("strong", null, "Total Receitas");
    tl.style.fontSize = ".9rem";
    var tv = el("div", null);
    tv.style.cssText = "display:flex;gap:20px;font-size:.9rem;";
    var pS = document.createElement("span");
    var rS = document.createElement("span");
    var pL = el("span", null, "Previsto: ");
    pL.style.color = "var(--muted)";
    var rL = el("span", null, "Realizado: ");
    rL.style.color = "var(--muted)";
    pS.appendChild(pL);
    pS.appendChild(gPrevEl);
    rS.appendChild(rL);
    rS.appendChild(gRealEl);
    tv.appendChild(pS);
    tv.appendChild(rS);
    tw.appendChild(tl);
    tw.appendChild(tv);
    card.appendChild(tw);
    return card;
  }

  /* ============================================================
     Curva de Desembolso — gráfico SVG de barras mensais
     ============================================================ */
  function renderCurvaDesembolso() {
    var contratos = getContratosFechados();
    var byMonth = {};
    contratos.forEach(function (f) {
      (Array.isArray(f.desembolsos) ? f.desembolsos : []).forEach(function (d) {
        if (!d.mes) return;
        if (!byMonth[d.mes]) byMonth[d.mes] = { previsto: 0, realizado: 0 };
        byMonth[d.mes].previsto += toNumber(d.previsto !== undefined ? d.previsto : d.valor);
        byMonth[d.mes].realizado += toNumber(d.realizado);
      });
    });

    var card = el("div", "card stack");
    card.appendChild(el("h3", "section-title", "Curva de Desembolso"));

    var meses = Object.keys(byMonth).sort();
    if (!meses.length) {
      var hint = el("p", null, "Nenhum desembolso cadastrado. Va em Contratacoes, abra um contrato fechado e adicione desembolsos mensais.");
      hint.style.cssText = "color:var(--muted);font-size:.85rem;";
      card.appendChild(hint);
      return card;
    }

    var Gestao = window.Gestao;
    var maxVal = Math.max.apply(null, meses.map(function (m) {
      return Math.max(byMonth[m].previsto, byMonth[m].realizado);
    }));
    var W = 680, H = 220;
    var PL = 72, PB = 44, PT = 22, PR = 18;
    var cW = W - PL - PR, cH = H - PT - PB;
    var barW = Math.max(8, Math.min(44, Math.floor(cW / meses.length) - 8));
    var ABRL = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

    // Curva S acumulada (previsto)
    var cumPrev = [];
    var runningCum = 0;
    meses.forEach(function (m) { runningCum += byMonth[m].previsto; cumPrev.push(runningCum); });
    var totalCum = runningCum || 1;
    // Escala unica: comporta tanto as barras mensais quanto o acumulado
    var maxScale = Math.max(maxVal, totalCum) || 1;

    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.style.cssText = "width:100%;max-width:760px;display:block;margin:0 auto;";

    function svgEl(tag, attrs) {
      var e = document.createElementNS(ns, tag);
      Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
      return e;
    }
    function txt(x, y, content, fs, fill, anchor) {
      var t = svgEl("text", { x: x, y: y, "font-size": fs || 10, fill: fill || "#64748b", "text-anchor": anchor || "middle" });
      t.textContent = content;
      return t;
    }

    // Linhas de grade + labels eixo Y unico (escala unica)
    var steps = 4;
    var s;
    for (s = 0; s <= steps; s++) {
      var yVal = maxScale / steps * s;
      var yPx = PT + cH - Math.round(cH * s / steps);
      svg.appendChild(svgEl("line", { x1: PL, x2: PL + cW, y1: yPx, y2: yPx, stroke: "#e2e8f0", "stroke-width": 1 }));
      var yLbl = yVal >= 1000 ? "R$" + Math.round(yVal / 1000) + "k" : "R$" + Math.round(yVal);
      svg.appendChild(txt(PL - 5, yPx + 4, yLbl, 9, "#94a3b8", "end"));
    }

    // Barras agrupadas + centros dos slots para a curva S
    var totalPrev = 0, totalReal = 0;
    var slotCenters = [];
    meses.forEach(function (mes, i) {
      var v = byMonth[mes];
      totalPrev += v.previsto;
      totalReal += v.realizado;
      var slotW = cW / meses.length;
      var gap = 2;
      var bw = Math.max(4, Math.floor((barW - gap) / 2));
      var slotX = Math.round(PL + slotW * i + (slotW - bw * 2 - gap) / 2);
      slotCenters.push(slotX + bw + gap / 2);

      var hPrev = maxScale > 0 ? Math.round((v.previsto / maxScale) * cH) : 0;
      svg.appendChild(svgEl("rect", { x: slotX, y: PT + cH - hPrev, width: bw, height: hPrev, fill: "#6d28d9", rx: 2 }));

      var hReal = maxScale > 0 ? Math.round((v.realizado / maxScale) * cH) : 0;
      svg.appendChild(svgEl("rect", { x: slotX + bw + gap, y: PT + cH - hReal, width: bw, height: hReal, fill: "#1F9D6B", rx: 2 }));

      if (v.previsto > 0) {
        var vLbl = v.previsto >= 1000 ? "R$" + Math.round(v.previsto / 1000) + "k" : "R$" + Math.round(v.previsto);
        svg.appendChild(txt(slotX + bw / 2, PT + cH - hPrev - 3, vLbl, 8, "#475569"));
      }

      var p = mes.split("-");
      var mAbr = (ABRL[parseInt(p[1], 10) - 1] || p[1]) + "/" + (p[0] ? p[0].slice(2) : "");
      svg.appendChild(txt(slotX + bw + gap / 2, PT + cH + 16, mAbr, 9, "#64748b"));
    });

    // Curva S — polyline laranja sobre as barras
    if (meses.length > 0) {
      var pts = meses.map(function (mes, i) {
        return slotCenters[i] + "," + (PT + cH - Math.round((cumPrev[i] / maxScale) * cH));
      });
      svg.appendChild(svgEl("polyline", {
        points: pts.join(" "),
        fill: "none",
        stroke: "#f59e0b",
        "stroke-width": "2",
        "stroke-linejoin": "round",
        "stroke-linecap": "round"
      }));
      pts.forEach(function (pt) {
        var xy = pt.split(",");
        svg.appendChild(svgEl("circle", { cx: xy[0], cy: xy[1], r: "3.5", fill: "#f59e0b", stroke: "#fff", "stroke-width": "1.5" }));
      });
    }

    // Legenda
    var legendY = H - 8;
    svg.appendChild(svgEl("rect", { x: PL, y: legendY - 7, width: 10, height: 7, fill: "#6d28d9", rx: 1 }));
    svg.appendChild(txt(PL + 13, legendY, "Previsto", 9, "#475569", "start"));
    svg.appendChild(svgEl("rect", { x: PL + 72, y: legendY - 7, width: 10, height: 7, fill: "#1F9D6B", rx: 1 }));
    svg.appendChild(txt(PL + 85, legendY, "Realizado", 9, "#475569", "start"));
    svg.appendChild(svgEl("line", { x1: PL + 154, y1: legendY - 3, x2: PL + 168, y2: legendY - 3, stroke: "#f59e0b", "stroke-width": "2" }));
    svg.appendChild(svgEl("circle", { cx: PL + 161, cy: legendY - 3, r: "3", fill: "#f59e0b" }));
    svg.appendChild(txt(PL + 171, legendY, "Acumulado prev.", 9, "#475569", "start"));

    card.style.position = "relative";
    card.appendChild(svg);

    // Tooltip flutuante (aparece ao passar o mouse sobre a coluna do mes)
    var tooltip = document.createElement("div");
    tooltip.style.cssText = "position:absolute;background:rgba(15,10,40,.92);color:#fff;border-radius:8px;font-size:.74rem;padding:8px 12px;pointer-events:none;display:none;z-index:50;white-space:nowrap;line-height:1.7;box-shadow:0 4px 14px rgba(0,0,0,.25);";
    card.appendChild(tooltip);

    // Linha-guia vertical (segue a coluna sob o cursor)
    var guide = svgEl("line", { x1: 0, y1: PT, x2: 0, y2: PT + cH, stroke: "#94a3b8", "stroke-width": 1, "stroke-dasharray": "3 3", opacity: 0 });
    svg.appendChild(guide);

    // Overlay transparente por coluna: captura o hover de forma confiavel
    var slotW = cW / meses.length;
    meses.forEach(function (mes, i) {
      var v = byMonth[mes];
      var x0 = PL + slotW * i;
      var center = slotCenters[i];
      var hot = svgEl("rect", { x: x0, y: PT, width: slotW, height: cH, fill: "#6d28d9", "fill-opacity": 0 });
      hot.style.cursor = "pointer";

      function show(e) {
        hot.setAttribute("fill-opacity", 0.06);
        guide.setAttribute("x1", center);
        guide.setAttribute("x2", center);
        guide.setAttribute("opacity", 1);
        var p = mes.split("-");
        var mAbr = (ABRL[parseInt(p[1], 10) - 1] || p[1]) + "/" + p[0];
        var cardRect = card.getBoundingClientRect();
        tooltip.style.display = "block";
        tooltip.style.left = (e.clientX - cardRect.left + 14) + "px";
        tooltip.style.top  = (e.clientY - cardRect.top  - 10) + "px";
        while (tooltip.firstChild) tooltip.removeChild(tooltip.firstChild);
        var hd = document.createElement("strong");
        hd.textContent = mAbr;
        tooltip.appendChild(hd);
        tooltip.appendChild(document.createElement("br"));
        tooltip.appendChild(document.createTextNode("Desembolso previsto: " + Gestao.fmtBRL(v.previsto)));
        tooltip.appendChild(document.createElement("br"));
        tooltip.appendChild(document.createTextNode("Realizado: " + Gestao.fmtBRL(v.realizado)));
        tooltip.appendChild(document.createElement("br"));
        tooltip.appendChild(document.createTextNode("Acumulado previsto: " + Gestao.fmtBRL(cumPrev[i])));
      }
      function hide() {
        hot.setAttribute("fill-opacity", 0);
        guide.setAttribute("opacity", 0);
        tooltip.style.display = "none";
      }
      hot.addEventListener("mouseenter", show);
      hot.addEventListener("mousemove", show);
      hot.addEventListener("mouseleave", hide);
      svg.appendChild(hot);
    });

    var info = el("div", null, "Previsto total: " + Gestao.fmtBRL(totalPrev) + "   Realizado: " + Gestao.fmtBRL(totalReal));
    info.style.cssText = "text-align:right;font-size:.78rem;color:var(--muted);margin-top:2px;";
    card.appendChild(info);
    return card;
  }

  /* ============================================================
     Cabeçalho padrão da aba (logo + título + cartão de saldo)
     ------------------------------------------------------------
     O cartão à direita mostra o SALDO realizado (receita realizada −
     despesa realizada). Texto do valor em verde se positivo, laranja
     se negativo, sobre o fundo roxo (accent).
     ============================================================ */
  function buildHeader(fin) {
    var Gestao = window.Gestao;
    var t = computeTotals(fin);
    var saldo = t.recReal - t.despReal;

    var right = Gestao.headerStat({
      label: "Saldo realizado",
      value: Gestao.fmtBRL(saldo),
      accent: true
    });
    // Realce de sinal no valor (verde positivo / laranja negativo).
    var valueEl = right.querySelector(".head-stat__value");
    if (valueEl) {
      valueEl.style.color = saldo >= 0 ? "#7BE0A8" : "#F2A488";
      valueEl.style.fontSize = "22px";
    }

    return Gestao.pageHeader({
      eyebrow: "FINANCEIRO · SUMMIT POA PMIRS 2026",
      title: "Receitas, despesas e saldo",
      subtitle: "Controle orçamentário do evento",
      right: right
    });
  }

  /* ============================================================
     Render principal da aba
     ============================================================ */
  var _mount = null;

  function render() {
    if (!_mount) return;
    var fin = getFin();
    clear(_mount);

    // Cabeçalho padrão (estilo Cronograma) + cartão de saldo à direita.
    _mount.appendChild(buildHeader(fin));

    var root = el("div", "stack");

    root.appendChild(renderResumo(fin));
    root.appendChild(renderInscricoes());
    root.appendChild(renderTabela(fin, "despesa"));
    root.appendChild(renderCurvaDesembolso());

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
