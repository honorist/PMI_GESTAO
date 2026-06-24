/* ============================================================
   metas.js — Módulo Metas & KPIs (aba "Metas")
   ------------------------------------------------------------
   Acompanhamento dos alvos do evento. Para cada meta:
   - nome, valor atual / alvo (R$ via Gestao.fmtBRL; caso
     contrário número + unidade), barra de progresso (atual/alvo,
     limitada a 100%) e % atingido.
   - Cor da barra: laranja (<50%), roxo (50–99%), verde (≥100%).
   - Edição rápida do "atual" inline + CRUD completo (modal).
   - Persiste via Gestao.save().

   Contrato consumido (window.Gestao):
     Gestao.data.metas = { metas:[{id,nome,alvo,atual,unidade}] }
     Gestao.fmtBRL(n) · Gestao.uid(prefix) · Gestao.save()
     Gestao.onTab(id, fn) · Gestao.pageHeader(...) · Gestao.headerStat(...)

   Segurança: todo valor do usuário vai ao DOM via
   textContent / .value (nunca innerHTML com dados) — anti-XSS.
   ============================================================ */

(function () {
  "use strict";

  var TAB_ID = "tab-metas";
  var UNIDADE_REAL = "R$";

  // Limiares de cor da barra de progresso.
  var LIMIAR_BAIXO = 50; // < 50% => laranja
  var LIMIAR_ALTO = 100; // >= 100% => verde; entre => roxo

  /* ============================================================
     Injeção do CSS do módulo (uma única vez)
     ============================================================ */
  function ensureStyles() {
    var HREF = "css/metas.css";
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

  /* ============================================================
     Parse numérico robusto (aceita vírgula decimal pt-BR)
     ------------------------------------------------------------
     "1.234,56" -> 1234.56 · "1234,56" -> 1234.56 ·
     "1.234" (milhar) -> 1234 · "12.5" (decimal) -> 12.5
     Função pura, testável.
     ============================================================ */
  function parseNum(text) {
    if (typeof text === "number") return isFinite(text) ? text : 0;
    if (text === null || text === undefined) return 0;
    var s = String(text).trim();
    if (s === "") return 0;
    s = s.replace(/[^0-9.,-]/g, "");
    if (s === "" || s === "-") return 0;
    var hasComma = s.indexOf(",") !== -1;
    var hasDot = s.indexOf(".") !== -1;
    if (hasComma && hasDot) {
      // pt-BR: ponto = milhar, vírgula = decimal.
      s = s.replace(/\./g, "").replace(",", ".");
    } else if (hasComma) {
      s = s.replace(",", ".");
    } else if (hasDot && /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
      // Só pontos no padrão de milhar (1.234.567) => remove.
      s = s.replace(/\./g, "");
    }
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  // Representação editável de um número (decimal com vírgula pt-BR).
  function numInput(n) {
    var v = parseNum(n);
    if (v === 0) return "";
    return String(v).replace(".", ",");
  }

  /* ============================================================
     Cálculos (funções puras, testáveis)
     ============================================================ */

  // % atingido = atual/alvo*100, inteiro. Sem limite superior
  // (pode passar de 100% — usado no rótulo). Alvo <= 0 => 0.
  function pctAtingido(atual, alvo) {
    var a = parseNum(atual);
    var t = parseNum(alvo);
    if (t <= 0) return 0;
    return Math.round((a / t) * 100);
  }

  // Largura da barra: limitada a 0–100 (não estoura o trilho).
  function larguraBarra(atual, alvo) {
    return Math.max(0, Math.min(100, pctAtingido(atual, alvo)));
  }

  // Classe de cor da barra conforme o progresso.
  function corClasse(pct) {
    if (pct >= LIMIAR_ALTO) return "is-verde";
    if (pct < LIMIAR_BAIXO) return "is-laranja";
    return "is-roxo";
  }

  // Formata o valor (atual ou alvo) conforme a unidade.
  function fmtValor(valor, unidade) {
    var n = parseNum(valor);
    if (unidade === UNIDADE_REAL) {
      if (window.Gestao && window.Gestao.fmtBRL) return window.Gestao.fmtBRL(n);
      return "R$ " + n.toFixed(2).replace(".", ",");
    }
    // Número formatado pt-BR + unidade (quando houver).
    var numTxt = formatarNumeroPtBR(n);
    var u = unidade && String(unidade).trim();
    return u ? numTxt + " " + u : numTxt;
  }

  // Número pt-BR sem casas desnecessárias (até 2 decimais).
  function formatarNumeroPtBR(n) {
    var v = isFinite(n) ? n : 0;
    try {
      return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(v);
    } catch (e) {
      return String(v).replace(".", ",");
    }
  }

  /* ============================================================
     Acesso aos dados
     ============================================================ */
  function getMetas() {
    var data = (window.Gestao && window.Gestao.data) || {};
    var m = data.metas || {};
    if (!Array.isArray(m.metas)) m.metas = [];
    data.metas = m;
    if (window.Gestao) window.Gestao.data = data;
    return m.metas;
  }

  function findMeta(id) {
    var list = getMetas();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  /* ============================================================
     CRUD
     ============================================================ */
  function setAtual(id, valor) {
    var list = getMetas();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        list[i] = Object.assign({}, list[i], { atual: parseNum(valor) });
        break;
      }
    }
    window.Gestao.save();
    render();
  }

  function upsertMeta(id, values) {
    var list = getMetas();
    if (id) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) {
          list[i] = Object.assign({}, list[i], values, { id: id });
          break;
        }
      }
    } else {
      var novo = Object.assign({ id: window.Gestao.uid("mt") }, values);
      list.push(novo);
    }
    window.Gestao.save();
    render();
  }

  function removeMeta(id, nome) {
    var rotulo =
      nome && String(nome).trim() ? '"' + String(nome).trim() + '"' : "esta meta";
    if (!window.confirm("Excluir " + rotulo + "?")) return;
    var data = window.Gestao.data;
    data.metas.metas = getMetas().filter(function (x) {
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
    if (_backdrop && _backdrop.parentNode) _backdrop.parentNode.removeChild(_backdrop);
    _backdrop = null;
    document.removeEventListener("keydown", onEscClose);
  }

  function onEscClose(e) {
    if (e.key === "Escape") closeForm();
  }

  function field(labelText, inputEl, full) {
    var wrap = el("div", "mt-field" + (full ? " full" : ""));
    var id = "mt-f-" + window.Gestao.uid("x");
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
    var existing = id ? findMeta(id) : null;

    closeForm();

    _backdrop = el("div", "mt-modal-backdrop");
    _backdrop.addEventListener("click", function (e) {
      if (e.target === _backdrop) closeForm();
    });

    var modal = el("div", "mt-modal");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", existing ? "Editar meta" : "Nova meta");
    modal.appendChild(el("h3", "section-title", existing ? "Editar meta" : "Nova meta"));

    var form = document.createElement("form");
    form.className = "mt-form";

    var inNome = makeInput("text", existing ? existing.nome || "" : "");
    inNome.placeholder = "Ex.: Participantes";
    inNome.required = true;
    form.appendChild(field("Nome", inNome, true));

    var inAlvo = makeInput("text", existing ? numInput(existing.alvo) : "");
    inAlvo.placeholder = "0";
    inAlvo.inputMode = "decimal";
    form.appendChild(field("Alvo", inAlvo));

    var inAtual = makeInput("text", existing ? numInput(existing.atual) : "");
    inAtual.placeholder = "0";
    inAtual.inputMode = "decimal";
    form.appendChild(field("Atual", inAtual));

    var inUnidade = makeInput("text", existing ? existing.unidade || "" : "");
    inUnidade.placeholder = "Ex.: pessoas, pontos, R$, contratos";
    inUnidade.setAttribute(
      "list",
      "mt-unidades-" + (existing ? existing.id : "novo")
    );
    var datalist = document.createElement("datalist");
    datalist.id = inUnidade.getAttribute("list");
    ["pessoas", "pontos", "R$", "contratos"].forEach(function (u) {
      var opt = document.createElement("option");
      opt.value = u;
      datalist.appendChild(opt);
    });
    var unidadeField = field("Unidade", inUnidade);
    unidadeField.appendChild(datalist);
    form.appendChild(unidadeField);

    var actions = el("div", "mt-form-actions");
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
        alvo: parseNum(inAlvo.value),
        atual: parseNum(inAtual.value),
        unidade: inUnidade.value.trim()
      };
      upsertMeta(id, values);
      closeForm();
    });

    modal.appendChild(form);
    _backdrop.appendChild(modal);
    document.body.appendChild(_backdrop);
    document.addEventListener("keydown", onEscClose);
    inNome.focus();
  }

  /* ============================================================
     Cabeçalho padrão da aba (logo + título + cartão com nº de metas)
     ============================================================ */
  function buildHeader(metas) {
    var Gestao = window.Gestao;
    var n = metas.length;
    var atingidas = metas.filter(function (m) {
      return pctAtingido(m.atual, m.alvo) >= LIMIAR_ALTO;
    }).length;

    var right = Gestao.headerStat({
      label: "Metas",
      value: String(n),
      sub: atingidas + (atingidas === 1 ? " atingida" : " atingidas"),
      accent: true
    });

    return Gestao.pageHeader({
      eyebrow: "METAS · SUMMIT POA PMIRS 2026",
      title: "Metas & KPIs",
      subtitle: "Acompanhe os alvos do evento",
      right: right
    });
  }

  /* ============================================================
     Render: card de uma meta
     ============================================================ */
  function buildBarra(pct) {
    var largura = Math.max(0, Math.min(100, pct));
    var bar = el("div", "mt-bar");
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-valuenow", String(pct));
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", "100");
    var fill = el("div", "mt-bar__fill " + corClasse(pct));
    fill.style.width = largura + "%";
    bar.appendChild(fill);
    return bar;
  }

  // Edição rápida inline do "atual": clicar em "Editar atual" troca o
  // valor por um input; Enter/blur salva, Esc cancela.
  function buildAtualInline(meta) {
    var wrap = el("div", "mt-atual");

    var valorTxt = el("span", "mt-atual__valor", fmtValor(meta.atual, meta.unidade));
    var alvoTxt = el(
      "span",
      "mt-atual__alvo",
      " / " + fmtValor(meta.alvo, meta.unidade)
    );
    wrap.appendChild(valorTxt);
    wrap.appendChild(alvoTxt);

    var editBtn = el("button", "btn btn-ghost sm mt-atual__edit", "Editar atual");
    editBtn.type = "button";
    editBtn.setAttribute("aria-label", "Editar valor atual de " + (meta.nome || "meta"));
    wrap.appendChild(editBtn);

    editBtn.addEventListener("click", function () {
      var input = makeInput("text", numInput(meta.atual));
      input.className = "mt-atual__input";
      input.inputMode = "decimal";
      input.setAttribute("aria-label", "Valor atual de " + (meta.nome || "meta"));

      var ok = el("button", "btn btn-primary sm", "OK");
      ok.type = "button";
      var cancelar = el("button", "btn btn-ghost sm", "Cancelar");
      cancelar.type = "button";

      var editor = el("div", "mt-atual mt-atual--editing");
      editor.appendChild(input);
      editor.appendChild(ok);
      editor.appendChild(cancelar);

      wrap.parentNode.replaceChild(editor, wrap);
      input.focus();
      input.select();

      function salvar() {
        setAtual(meta.id, input.value);
      }
      function cancelar2() {
        render();
      }
      ok.addEventListener("click", salvar);
      cancelar.addEventListener("click", cancelar2);
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          salvar();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancelar2();
        }
      });
    });

    return wrap;
  }

  function buildMetaCard(meta) {
    var pct = pctAtingido(meta.atual, meta.alvo);
    var card = el("div", "card mt-card");

    // Cabeçalho do card: nome + % atingido + ações.
    var head = el("div", "mt-card__head");
    head.appendChild(el("h3", "mt-card__nome", meta.nome || "(sem nome)"));

    var pctBadge = el("span", "mt-card__pct " + corClasse(pct), pct + "%");
    head.appendChild(pctBadge);
    card.appendChild(head);

    // Valor atual / alvo (com edição rápida inline).
    card.appendChild(buildAtualInline(meta));

    // Barra de progresso.
    card.appendChild(buildBarra(pct));

    // Rodapé: ações de editar/excluir.
    var foot = el("div", "mt-card__foot");
    var edit = el("button", "btn btn-ghost sm", "Editar");
    edit.type = "button";
    edit.addEventListener("click", function () {
      openForm(meta.id);
    });
    foot.appendChild(edit);
    var del = el("button", "btn btn-ghost sm", "Excluir");
    del.type = "button";
    del.addEventListener("click", function () {
      removeMeta(meta.id, meta.nome);
    });
    foot.appendChild(del);
    card.appendChild(foot);

    return card;
  }

  /* ============================================================
     Render principal
     ============================================================ */
  var _mount = null;

  function render() {
    if (!_mount) return;
    var metas = getMetas();
    clear(_mount);

    // Cabeçalho padrão + cartão com nº de metas.
    _mount.appendChild(buildHeader(metas));

    var root = el("div", "stack");

    // Barra de ações (botão de adicionar).
    var bar = el("div", "spread");
    bar.appendChild(
      el("span", "muted-text", "Atualize o valor atual de cada meta conforme o evento avança.")
    );
    var addBtn = el("button", "btn btn-primary sm", "+ Meta");
    addBtn.type = "button";
    addBtn.addEventListener("click", function () {
      openForm(null);
    });
    bar.appendChild(addBtn);
    root.appendChild(bar);

    if (!metas.length) {
      root.appendChild(el("div", "empty", "Nenhuma meta cadastrada. Use “+ Meta”."));
    } else {
      var grid = el("div", "grid cols-3 mt-grid");
      metas.forEach(function (m) {
        grid.appendChild(buildMetaCard(m));
      });
      root.appendChild(grid);
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
    } else if (typeof document !== "undefined") {
      document.addEventListener("DOMContentLoaded", function () {
        if (window.Gestao && typeof window.Gestao.onTab === "function") {
          window.Gestao.onTab(TAB_ID, init);
        }
      });
    }
  }

  // Exporta funções puras para teste em Node (sem afetar o browser).
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      parseNum: parseNum,
      numInput: numInput,
      pctAtingido: pctAtingido,
      larguraBarra: larguraBarra,
      corClasse: corClasse,
      fmtValor: fmtValor,
      formatarNumeroPtBR: formatarNumeroPtBR
    };
  }
})();
