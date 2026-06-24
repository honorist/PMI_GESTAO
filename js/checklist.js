/* ============================================================
   checklist.js — Módulo Checklist (aba "Checklist")
   ------------------------------------------------------------
   Roteiro do evento (run-of-show): atividades hora a hora,
   agrupadas por dia (Montagem → Dia 13 → Dia 14 → Desmontagem)
   e ordenadas por horário dentro de cada dia.

   - Cada item: checkbox (feito) + hora + atividade + responsável
     + local. Marcar "feito" persiste e atualiza a % no cabeçalho.
   - Barra de progresso por dia (itens feitos / total do dia).
   - CRUD completo (modal): + Item, editar e excluir. Persiste
     via Gestao.save().

   Contrato consumido (window.Gestao):
     Gestao.data.checklist = { itens:[{id,dia,hora,atividade,
       responsavel,local,feito}] }
     Gestao.uid(prefix) · Gestao.save() · Gestao.onTab(id, fn)
     Gestao.pageHeader(...) · Gestao.headerStat(...)

   Segurança: todo valor do usuário vai ao DOM via
   textContent / .value (nunca innerHTML com dados) — anti-XSS.
   ============================================================ */

(function () {
  "use strict";

  var TAB_ID = "tab-checklist";

  // Ordem fixa dos dias do run-of-show. Itens cujo "dia" não está
  // nesta lista vão para um grupo "Outros" no fim (robustez).
  var DIAS = [
    "Montagem (12/11)",
    "Dia 13 (Workshops)",
    "Dia 14 (Evento)",
    "Desmontagem (15/11)"
  ];
  var DIA_OUTROS = "Outros";

  /* ============================================================
     Injeção do CSS do módulo (uma única vez)
     ============================================================ */
  function ensureStyles() {
    var HREF = "css/checklist.css";
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
     Acesso aos dados
     ============================================================ */
  function getItens() {
    var data = (window.Gestao && window.Gestao.data) || {};
    var ck = data.checklist || {};
    if (!Array.isArray(ck.itens)) ck.itens = [];
    data.checklist = ck;
    if (window.Gestao) window.Gestao.data = data;
    return ck.itens;
  }

  function findItem(id) {
    var list = getItens();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  /* ============================================================
     Agrupamento + ordenação (funções puras, testáveis)
     ------------------------------------------------------------
     groupByDia: devolve uma lista ordenada de
       { dia, itens:[...], feitos, total }
     na ordem canônica dos dias; cada grupo com seus itens
     ordenados por "hora" (string HH:MM ordena lexicograficamente).
     ============================================================ */
  function ordemDoDia(dia) {
    var idx = DIAS.indexOf(dia);
    return idx === -1 ? DIAS.length : idx; // desconhecidos vão ao fim
  }

  function compararHora(a, b) {
    var ha = String(a.hora || "");
    var hb = String(b.hora || "");
    if (ha < hb) return -1;
    if (ha > hb) return 1;
    return 0;
  }

  function groupByDia(itens) {
    var lista = Array.isArray(itens) ? itens : [];
    var mapa = {}; // dia -> array
    lista.forEach(function (it) {
      var dia = (it && it.dia) || DIA_OUTROS;
      if (!mapa[dia]) mapa[dia] = [];
      mapa[dia].push(it);
    });

    // Mantém a ordem canônica e acrescenta dias extras (ex.: "Outros")
    // em ordem alfabética estável depois dos conhecidos.
    var chaves = Object.keys(mapa);
    chaves.sort(function (a, b) {
      var oa = ordemDoDia(a);
      var ob = ordemDoDia(b);
      if (oa !== ob) return oa - ob;
      return a < b ? -1 : a > b ? 1 : 0;
    });

    return chaves.map(function (dia) {
      var arr = mapa[dia].slice().sort(compararHora);
      var feitos = arr.filter(function (it) {
        return !!it.feito;
      }).length;
      return { dia: dia, itens: arr, feitos: feitos, total: arr.length };
    });
  }

  // % concluído global (itens feitos / total). Devolve inteiro 0–100.
  function pctConcluido(itens) {
    var lista = Array.isArray(itens) ? itens : [];
    if (!lista.length) return 0;
    var feitos = lista.filter(function (it) {
      return !!it.feito;
    }).length;
    return Math.round((feitos / lista.length) * 100);
  }

  function pctGrupo(grupo) {
    if (!grupo || !grupo.total) return 0;
    return Math.round((grupo.feitos / grupo.total) * 100);
  }

  /* ============================================================
     CRUD
     ============================================================ */
  function toggleFeito(id, valor) {
    var list = getItens();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        list[i] = Object.assign({}, list[i], { feito: !!valor });
        break;
      }
    }
    window.Gestao.save();
    render();
  }

  function upsertItem(id, values) {
    var list = getItens();
    if (id) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) {
          list[i] = Object.assign({}, list[i], values, { id: id });
          break;
        }
      }
    } else {
      var novo = Object.assign({ id: window.Gestao.uid("ck"), feito: false }, values);
      list.push(novo);
    }
    window.Gestao.save();
    render();
  }

  function removeItem(id, atividade) {
    var rotulo =
      atividade && String(atividade).trim()
        ? '"' + String(atividade).trim() + '"'
        : "esta atividade";
    if (!window.confirm("Excluir " + rotulo + "?")) return;
    var data = window.Gestao.data;
    data.checklist.itens = getItens().filter(function (x) {
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
    var wrap = el("div", "ck-field" + (full ? " full" : ""));
    var id = "ck-f-" + window.Gestao.uid("x");
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

  function makeDiaSelect(current) {
    var sel = document.createElement("select");
    DIAS.forEach(function (d) {
      var opt = document.createElement("option");
      opt.value = d;
      opt.textContent = d;
      if (d === current) opt.selected = true;
      sel.appendChild(opt);
    });
    // Se o item tiver um dia fora da lista canônica, preserva-o.
    if (current && DIAS.indexOf(current) === -1) {
      var extra = document.createElement("option");
      extra.value = current;
      extra.textContent = current;
      extra.selected = true;
      sel.appendChild(extra);
    }
    return sel;
  }

  function openForm(id) {
    var existing = id ? findItem(id) : null;

    closeForm();

    _backdrop = el("div", "ck-modal-backdrop");
    _backdrop.addEventListener("click", function (e) {
      if (e.target === _backdrop) closeForm();
    });

    var modal = el("div", "ck-modal");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", existing ? "Editar atividade" : "Nova atividade");
    modal.appendChild(
      el("h3", "section-title", existing ? "Editar atividade" : "Nova atividade")
    );

    var form = document.createElement("form");
    form.className = "ck-form";

    var selDia = makeDiaSelect(existing ? existing.dia : DIAS[0]);
    form.appendChild(field("Dia", selDia));

    var inHora = makeInput("time", existing ? existing.hora || "" : "");
    form.appendChild(field("Hora", inHora));

    var inAtividade = makeInput("text", existing ? existing.atividade || "" : "");
    inAtividade.placeholder = "Ex.: Abertura do credenciamento";
    inAtividade.required = true;
    form.appendChild(field("Atividade", inAtividade, true));

    var inResp = makeInput("text", existing ? existing.responsavel || "" : "");
    inResp.placeholder = "Responsável";
    form.appendChild(field("Responsável", inResp));

    var inLocal = makeInput("text", existing ? existing.local || "" : "");
    inLocal.placeholder = "Local";
    form.appendChild(field("Local", inLocal));

    var actions = el("div", "ck-form-actions");
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
      var atividade = inAtividade.value.trim();
      if (!atividade) {
        inAtividade.focus();
        return;
      }
      var values = {
        dia: selDia.value || DIAS[0],
        hora: inHora.value.trim(),
        atividade: atividade,
        responsavel: inResp.value.trim(),
        local: inLocal.value.trim()
      };
      upsertItem(id, values);
      closeForm();
    });

    modal.appendChild(form);
    _backdrop.appendChild(modal);
    document.body.appendChild(_backdrop);
    document.addEventListener("keydown", onEscClose);
    inAtividade.focus();
  }

  /* ============================================================
     Cabeçalho padrão da aba (logo + título + cartão de %)
     ============================================================ */
  function buildHeader(itens) {
    var Gestao = window.Gestao;
    var pct = pctConcluido(itens);
    var feitos = itens.filter(function (it) {
      return !!it.feito;
    }).length;

    var right = Gestao.headerStat({
      label: "% concluído",
      value: pct + "%",
      sub: feitos + " de " + itens.length + " atividades",
      accent: true
    });

    return Gestao.pageHeader({
      eyebrow: "CHECKLIST · SUMMIT POA PMIRS 2026",
      title: "Roteiro do evento (run-of-show)",
      subtitle: "Atividades hora a hora — dias 13 e 14 de novembro",
      right: right
    });
  }

  /* ============================================================
     Render: grupo (dia) com barra de progresso + itens
     ============================================================ */
  function buildBarra(pct) {
    var bar = el("div", "ck-bar");
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-valuenow", String(pct));
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", "100");
    var fill = el("div", "ck-bar__fill");
    fill.style.width = Math.max(0, Math.min(100, pct)) + "%";
    if (pct >= 100) fill.classList.add("is-done");
    bar.appendChild(fill);
    return bar;
  }

  function buildItem(it) {
    var row = el("li", "ck-item" + (it.feito ? " is-feito" : ""));

    // Checkbox (feito).
    var cbId = "ck-cb-" + it.id;
    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "ck-item__cb";
    cb.id = cbId;
    cb.checked = !!it.feito;
    cb.setAttribute(
      "aria-label",
      "Marcar como concluído: " + (it.atividade || "atividade")
    );
    cb.addEventListener("change", function () {
      toggleFeito(it.id, cb.checked);
    });
    row.appendChild(cb);

    // Hora.
    var hora = el("span", "ck-item__hora", it.hora || "—");
    row.appendChild(hora);

    // Corpo: atividade + meta (responsável · local).
    var body = el("div", "ck-item__body");
    var lblAtividade = el("label", "ck-item__atividade", it.atividade || "(sem descrição)");
    lblAtividade.setAttribute("for", cbId);
    body.appendChild(lblAtividade);

    var metaParts = [];
    if (it.responsavel && String(it.responsavel).trim()) metaParts.push(String(it.responsavel).trim());
    if (it.local && String(it.local).trim()) metaParts.push(String(it.local).trim());
    if (metaParts.length) {
      var meta = el("div", "ck-item__meta");
      if (it.responsavel && String(it.responsavel).trim()) {
        meta.appendChild(el("span", "ck-item__resp", String(it.responsavel).trim()));
      }
      if (it.local && String(it.local).trim()) {
        if (it.responsavel && String(it.responsavel).trim()) {
          meta.appendChild(el("span", "ck-item__sep", "·"));
        }
        meta.appendChild(el("span", "ck-item__local", String(it.local).trim()));
      }
      body.appendChild(meta);
    }
    row.appendChild(body);

    // Ações (editar / excluir).
    var actions = el("div", "ck-item__actions");
    var edit = el("button", "btn btn-ghost sm", "Editar");
    edit.type = "button";
    edit.addEventListener("click", function () {
      openForm(it.id);
    });
    actions.appendChild(edit);

    var del = el("button", "btn btn-ghost sm", "Excluir");
    del.type = "button";
    del.addEventListener("click", function () {
      removeItem(it.id, it.atividade);
    });
    actions.appendChild(del);
    row.appendChild(actions);

    return row;
  }

  function buildGrupo(grupo) {
    var pct = pctGrupo(grupo);
    var card = el("div", "card ck-grupo");

    var head = el("div", "ck-grupo__head");
    var titleWrap = el("div", "ck-grupo__titlewrap");
    titleWrap.appendChild(el("h3", "ck-grupo__title", grupo.dia));
    titleWrap.appendChild(
      el("span", "ck-grupo__count", grupo.feitos + "/" + grupo.total + " concluídas")
    );
    head.appendChild(titleWrap);
    head.appendChild(el("span", "ck-grupo__pct", pct + "%"));
    card.appendChild(head);

    card.appendChild(buildBarra(pct));

    var list = el("ul", "ck-list");
    grupo.itens.forEach(function (it) {
      list.appendChild(buildItem(it));
    });
    card.appendChild(list);

    return card;
  }

  /* ============================================================
     Render principal
     ============================================================ */
  var _mount = null;

  function render() {
    if (!_mount) return;
    var itens = getItens();
    clear(_mount);

    // Cabeçalho padrão + cartão com % concluído.
    _mount.appendChild(buildHeader(itens));

    var root = el("div", "stack");

    // Barra de ações (botão de adicionar).
    var bar = el("div", "spread");
    bar.appendChild(
      el("span", "muted-text", "Marque cada atividade conforme acontece durante o evento.")
    );
    var addBtn = el("button", "btn btn-primary sm", "+ Item");
    addBtn.type = "button";
    addBtn.addEventListener("click", function () {
      openForm(null);
    });
    bar.appendChild(addBtn);
    root.appendChild(bar);

    if (!itens.length) {
      root.appendChild(
        el("div", "empty", "Nenhuma atividade cadastrada. Use “+ Item”.")
      );
    } else {
      var grupos = groupByDia(itens);
      grupos.forEach(function (g) {
        root.appendChild(buildGrupo(g));
      });
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
      DIAS: DIAS,
      groupByDia: groupByDia,
      pctConcluido: pctConcluido,
      pctGrupo: pctGrupo,
      ordemDoDia: ordemDoDia,
      compararHora: compararHora
    };
  }
})();
