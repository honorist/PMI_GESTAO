/* ============================================================
   areas.js — Módulo "Áreas" (aba "Áreas")
   ------------------------------------------------------------
   Responsáveis por área temática do Summit. As áreas espelham os
   perfis de login do app (server.js -> AREA_ROLES): Governança,
   Conteúdo e Experiência. Cada área tem UMA pessoa responsável.

   Edição restrita à conta MESTRE:
   - A aba está mapeada com TAB_KEYS["tab-areas"] = null em app.js,
     então Gestao.tabEditavel() só devolve true para o master (e no
     modo vault/estático). Perfis de área e viewer veem em leitura.
   - No backend, o SERVIDOR só grava as chaves do tema de cada perfil
     de área; `areas` não pertence a nenhum tema, logo só o master
     (que substitui o estado inteiro) consegue persistir aqui.

   Contrato consumido (window.Gestao):
     Gestao.data.areas = { responsaveis: { <areaKey>: "Nome" } }
     Gestao.tabEditavel(id) · Gestao.save() · Gestao.onTab(id, fn)
     Gestao.pageHeader(opts) · Gestao.headerStat(opts) · Gestao.toast

   Segurança: todo valor do usuário vai ao DOM via textContent /
   .value (nunca innerHTML com dados) — protegido contra XSS.
   ============================================================ */

(function () {
  "use strict";

  var TAB_ID = "tab-areas";

  // Áreas temáticas = perfis de login (server.js AREA_ROLES). A descrição
  // resume os domínios que cada perfil edita, como contexto de leitura.
  var AREAS = [
    {
      key: "governanca",
      nome: "Governança",
      desc: "Cronograma, EAP, financeiro, contratações, reuniões, documentos, equipe, checklist e metas."
    },
    {
      key: "conteudo",
      nome: "Conteúdo",
      desc: "Palestrantes e prospecção."
    },
    {
      key: "experiencia",
      nome: "Experiência",
      desc: "Patrocínio e voluntários."
    }
  ];

  // Responsáveis-semente: entram apenas quando a área ainda NÃO tem um
  // responsável definido no estado (primeira vez que a seção é aberta).
  // Depois disso, o master controla o valor à vontade — inclusive apagar.
  var PADRAO = {
    experiencia: "Michelle Fonseca"
  };

  /* ============================================================
     CSS do módulo (injetado uma única vez)
     ============================================================ */
  function ensureStyles() {
    if (document.getElementById("areas-css")) return;
    var css = [
      ".areas-note{margin:2px 0 4px;}",
      ".areas-grid{gap:var(--space-4,16px);}",
      ".areas-card{display:flex;flex-direction:column;gap:10px;}",
      ".areas-card__top{display:flex;align-items:center;justify-content:space-between;gap:8px;}",
      ".areas-card__desc{color:var(--muted,#6F6149);font-size:13px;line-height:1.4;margin:0;}",
      ".areas-card__resp{margin-top:auto;padding-top:8px;border-top:1px solid var(--line,#E3DBCB);}",
      ".areas-card__resp-lbl{display:block;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted,#6F6149);margin-bottom:2px;}",
      ".areas-card__resp-nome{font-size:16px;font-weight:700;color:var(--ink,#242016);}",
      ".areas-card__resp-nome.is-vazio{font-weight:500;color:var(--muted,#6F6149);font-style:italic;}",
      ".areas-card__actions{display:flex;justify-content:flex-end;}",
      ".areas-modal-backdrop{position:fixed;inset:0;background:rgba(15,12,25,.5);display:flex;align-items:center;justify-content:center;z-index:1000;padding:16px;}",
      ".areas-modal{width:100%;max-width:420px;background:var(--card,#fff);color:var(--ink,#242016);border-radius:var(--rad,16px);padding:20px;box-shadow:var(--shadow,0 18px 48px rgba(0,0,0,.28));}",
      ".areas-field{display:flex;flex-direction:column;gap:6px;margin:14px 0 18px;}",
      ".areas-field label{font-weight:600;font-size:13px;}",
      ".areas-field input{padding:10px 12px;border:1px solid var(--line,#E3DBCB);border-radius:var(--rad-sm,10px);font:inherit;background:var(--card,#fff);color:var(--ink,#242016);}",
      ".areas-form-actions{display:flex;justify-content:flex-end;gap:8px;}"
    ].join("");
    var style = document.createElement("style");
    style.id = "areas-css";
    style.textContent = css;
    document.head.appendChild(style);
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
     ------------------------------------------------------------
     Garante data.areas.responsaveis e injeta os responsáveis-semente
     nas áreas ainda sem valor. Devolve true se semeou algo novo (para
     o render decidir persistir, quando o perfil puder gravar).
     ============================================================ */
  function ensureAreas() {
    var data = (window.Gestao && window.Gestao.data) || {};
    var areas = data.areas || {};
    if (!areas.responsaveis || typeof areas.responsaveis !== "object") {
      areas.responsaveis = {};
    }
    var semeou = false;
    Object.keys(PADRAO).forEach(function (k) {
      // `undefined` = nunca definido. String vazia (apagado pelo master)
      // conta como definido e NÃO é re-semeado.
      if (areas.responsaveis[k] === undefined) {
        areas.responsaveis[k] = PADRAO[k];
        semeou = true;
      }
    });
    data.areas = areas;
    if (window.Gestao) window.Gestao.data = data;
    return semeou;
  }

  function getResponsaveis() {
    ensureAreas();
    return window.Gestao.data.areas.responsaveis;
  }

  function podeEditar() {
    var g = window.Gestao;
    return !!(g && typeof g.tabEditavel === "function" && g.tabEditavel(TAB_ID));
  }

  /* ============================================================
     Cabeçalho padrão da aba
     ============================================================ */
  function buildHeader() {
    var Gestao = window.Gestao;
    var resp = getResponsaveis();
    var definidas = AREAS.filter(function (a) {
      return (resp[a.key] || "").trim();
    }).length;

    var right = Gestao.headerStat({
      label: "Com responsável",
      value: definidas + "/" + AREAS.length,
      sub: definidas === AREAS.length ? "todas definidas" : "áreas atribuídas",
      accent: true
    });

    return Gestao.pageHeader({
      eyebrow: "ÁREAS · SUMMIT POA PMIRS 2026",
      title: "Responsáveis por área",
      subtitle: "Quem lidera cada frente temática do Summit",
      right: right
    });
  }

  /* ============================================================
     Card de área
     ============================================================ */
  function renderCard(area, nome, editavel) {
    var card = el("div", "card areas-card");

    var top = el("div", "areas-card__top");
    top.appendChild(el("span", "badge purple", area.nome));
    card.appendChild(top);

    card.appendChild(el("p", "areas-card__desc", area.desc));

    var resp = el("div", "areas-card__resp");
    resp.appendChild(el("span", "areas-card__resp-lbl", "Responsável"));
    var nomeTxt = (nome || "").trim();
    resp.appendChild(
      el(
        "span",
        "areas-card__resp-nome" + (nomeTxt ? "" : " is-vazio"),
        nomeTxt || "Sem responsável"
      )
    );
    card.appendChild(resp);

    // Botões de edição só existem para quem pode gravar (master/vault).
    // aplicarReadonly() em app.js é a barreira redundante para os demais.
    if (editavel) {
      var actions = el("div", "areas-card__actions");
      var edit = el("button", "btn btn-ghost sm", "Editar");
      edit.type = "button";
      edit.addEventListener("click", function () {
        openForm(area);
      });
      actions.appendChild(edit);
      card.appendChild(actions);
    }

    return card;
  }

  /* ============================================================
     Formulário (modal) — role="dialog" pausa o polling do app
     enquanto o master edita (ver modalAberto() em app.js).
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

  function openForm(area) {
    closeForm();

    _backdrop = el("div", "areas-modal-backdrop");
    _backdrop.addEventListener("click", function (e) {
      // Clicar no backdrop (fora do modal) fecha; clicar dentro, não.
      if (e.target === _backdrop) closeForm();
    });

    var modal = el("div", "areas-modal");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Responsável por " + area.nome);
    modal.appendChild(el("h3", "section-title", "Responsável — " + area.nome));

    var form = document.createElement("form");

    var atual = (getResponsaveis()[area.key] || "").trim();

    var field = el("div", "areas-field");
    var inputId = "areas-f-nome";
    var lbl = el("label", null, "Nome do responsável");
    lbl.setAttribute("for", inputId);
    var input = document.createElement("input");
    input.type = "text";
    input.id = inputId;
    input.value = atual;
    input.placeholder = "Nome completo";
    input.autocomplete = "off";
    field.appendChild(lbl);
    field.appendChild(input);
    form.appendChild(field);

    var actions = el("div", "areas-form-actions");
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
      if (!podeEditar()) {
        closeForm();
        return;
      }
      getResponsaveis()[area.key] = input.value.trim();
      window.Gestao.save();
      window.Gestao.toast("Responsável salvo");
      closeForm();
      render();
    });

    modal.appendChild(form);
    _backdrop.appendChild(modal);
    document.body.appendChild(_backdrop);
    document.addEventListener("keydown", onEscClose);
    input.focus();
    input.select();
  }

  /* ============================================================
     Render principal
     ============================================================ */
  var _mount = null;

  function render() {
    if (!_mount) return;
    ensureStyles();

    var editavel = podeEditar();
    // Persiste a semente inicial só quando o perfil pode gravar (master
    // no backend, ou modo vault). Perfis de leitura apenas exibem o padrão.
    var semeou = ensureAreas();
    if (semeou && editavel) window.Gestao.save();

    var resp = getResponsaveis();

    clear(_mount);
    _mount.appendChild(buildHeader());

    var root = el("div", "stack");

    var nota = el(
      "p",
      "muted-text areas-note",
      editavel
        ? "As áreas espelham os perfis de acesso do app. Somente a conta mestre edita esta seção."
        : "Somente a conta mestre pode editar os responsáveis por área."
    );
    root.appendChild(nota);

    var grid = el("div", "grid cols-3 areas-grid");
    AREAS.forEach(function (area) {
      grid.appendChild(renderCard(area, resp[area.key], editavel));
    });
    root.appendChild(grid);

    _mount.appendChild(root);
  }

  /* ============================================================
     Registro no app
     ============================================================ */
  function init(mountEl /*, data */) {
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
    module.exports = { AREAS: AREAS, PADRAO: PADRAO };
  }
})();
