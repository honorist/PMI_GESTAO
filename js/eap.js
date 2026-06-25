/* ============================================================
   eap.js — Módulo "EAP" (Estrutura Analítica do Projeto)
   ------------------------------------------------------------
   Desenha a EAP como um ORGANOGRAMA CLÁSSICO top-down — IRMÃO
   VISUAL do organograma da aba "Equipe": caixas brancas com
   borda superior colorida, ligadas por linhas/barramento.

     Nível 0  →  raiz: "Summit POA PMIRS 2026" (caixa roxa de topo)
     Nível 1  →  fileira dos GTs (disciplinas): barramento horizontal
                 + uma caixa por GT (borda na cor do GT + contagem)
     Nível 2  →  pacotes de trabalho de cada GT, empilhados sob a
                 caixa do GT e ligados por espinha/cotovelo.

   Estrutura idêntica à da Equipe (mesmas regras CSS reaproveitadas
   em eap.css, prefixo .eap-*):
     .eap-oc-scroll > .eap-oc
       .eap-oc__lvl(.eap-oc__lvl--drop)  ← raiz + descida vertical
       .eap-oc__row                       ← barramento horizontal
         .eap-oc__col                     ← coluna (largura fixa) de cada GT
           .eap-onode                     ← caixa branca (borda colorida)
           .eap-stack                     ← pilha de pacotes (Nível 2)

   Cores: usa a `cor` de cada disciplina vinda de
   Gestao.data.cronograma.disciplinas, casada por id e, como
   fallback, por nome normalizado (sem acentos/conectores). Sem cor
   conhecida → roxo da marca (#36177B).

   Somente leitura. GT colapsável (clique na caixa do GT) — começa
   expandido. Container com scroll horizontal para caber os 9 GTs.
   Botão "Expandir tudo" no cabeçalho recolhe/expande todos os GTs.

   Segurança: todo valor de dado vai por textContent / createElement;
   innerHTML só é usado para limpar o mount.

   Registra-se via Gestao.onTab('tab-eap', render).
   ============================================================ */

(function () {
  "use strict";

  /* ---- Constantes ---- */
  var ROOT_LABEL = "Summit POA PMIRS 2026";
  var FALLBACK_COLOR = "#36177B"; // roxo da marca
  var FONTS_HREF =
    "https://fonts.googleapis.com/css2?" +
    "family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&" +
    "family=Manrope:wght@400;500;600;700&display=swap";

  /* ============================================================
     Injeção de CSS + fontes (uma única vez)
     ============================================================ */
  function ensureStyles() {
    if (!document.getElementById("eap-fonts")) {
      var f = document.createElement("link");
      f.id = "eap-fonts";
      f.rel = "stylesheet";
      f.href = FONTS_HREF;
      document.head.appendChild(f);
    }
    if (!document.getElementById("eap-css")) {
      var link = document.createElement("link");
      link.id = "eap-css";
      link.rel = "stylesheet";
      link.href = "css/eap.css";
      document.head.appendChild(link);
    }
  }

  /* ============================================================
     Helpers de criação de elementos (seguros)
     ============================================================ */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /* ============================================================
     Normalização de nome (para casar cores por nome)
     ------------------------------------------------------------
     minúsculas, sem acentos, sem conectores (e/de/da/...), só
     letras e números. Mesma estratégia usada em disciplinas.js.
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

  /* ============================================================
     Mapa de cores: disciplinaId/nome → cor
     ------------------------------------------------------------
     A partir de cronograma.disciplinas (que têm `cor`), constrói
     dois índices: por id exato e por nome normalizado.
     ============================================================ */
  function buildColorIndex(cronograma) {
    var porId = {};
    var porNome = {};
    var lista = (cronograma && cronograma.disciplinas) || [];
    lista.forEach(function (d) {
      if (!d || !d.cor) return;
      if (d.id) porId[d.id] = d.cor;
      var n = normalizar(d.nome);
      if (n) porNome[n] = d.cor;
    });
    return { porId: porId, porNome: porNome };
  }

  // Resolve a cor de uma disciplina da EAP: 1) id exato no cronograma;
  // 2) nome normalizado igual ou prefixo; 3) fallback roxo.
  function corDaDisciplina(disc, idx) {
    if (disc.id && idx.porId[disc.id]) return idx.porId[disc.id];

    var alvo = normalizar(disc.nome);
    if (alvo) {
      if (idx.porNome[alvo]) return idx.porNome[alvo];
      // prefixo: ex. "conteudo" (cronograma) × "conteudo programacao" (EAP)
      var chaves = Object.keys(idx.porNome);
      for (var i = 0; i < chaves.length; i++) {
        var k = chaves[i];
        if (k.indexOf(alvo) === 0 || alvo.indexOf(k) === 0) {
          return idx.porNome[k];
        }
      }
    }
    return FALLBACK_COLOR;
  }

  /* ============================================================
     Agregação: pacotes por disciplina (preservando a ordem)
     ============================================================ */
  function pacotesPorDisciplina(eap) {
    var mapa = {};
    var pacotes = (eap && eap.pacotes) || [];
    pacotes.forEach(function (p) {
      var k = p.disciplinaId || "__sem__";
      if (!mapa[k]) mapa[k] = [];
      mapa[k].push(p);
    });
    return mapa;
  }

  function contarPacotes(eap) {
    return ((eap && eap.pacotes) || []).length;
  }

  // Deriva mapa de pacotes a partir das tarefas do cronograma.
  // Cada tarefa vira um pacote de trabalho: código → id, nome, responsavel+obs → descricao.
  function pacotesDeCronograma(tarefas) {
    var mapa = {};
    (tarefas || []).forEach(function (t) {
      var k = t.disciplinaId || "__sem__";
      if (!mapa[k]) mapa[k] = [];
      var descParts = [];
      if (t.responsavel) descParts.push(t.responsavel);
      if (t.obs) descParts.push(t.obs);
      mapa[k].push({
        id: t.codigo || null,
        disciplinaId: t.disciplinaId,
        nome: t.nome,
        descricao: descParts.length ? descParts.join(" · ") : null
      });
    });
    return mapa;
  }

  /* ============================================================
     Cabeçalho padrão da aba (logo + título + botão "Expandir tudo")
     ------------------------------------------------------------
     Usa Gestao.pageHeader (estilo Cronograma). O botão de expandir/
     recolher tudo (classe .eap-toggle-all, usada pelo render) vai como
     o elemento "right". Subtítulo: {N} pacotes · {M} grupos.
     ============================================================ */
  function buildHeader(totalPacotes, totalDisc) {
    var subTxt =
      totalPacotes +
      (totalPacotes === 1 ? " pacote de trabalho" : " pacotes de trabalho") +
      " · " +
      totalDisc +
      (totalDisc === 1 ? " grupo de trabalho" : " grupos de trabalho");

    // GTs começam expandidos; o botão inicia em "Recolher tudo".
    var toggle = el("button", "btn sm eap-toggle-all", "Recolher tudo");
    toggle.type = "button";

    return window.Gestao.pageHeader({
      eyebrow: "EAP · SUMMIT POA PMIRS 2026",
      title: "Estrutura Analítica do Projeto",
      subtitle: subTxt,
      right: toggle
    });
  }

  /* ============================================================
     Nível 0 — caixa raiz (estilo da caixa de topo da Equipe)
     ============================================================ */
  function buildRootNode() {
    var box = el("div", "eap-onode eap-onode--root");
    box.style.borderTopColor = FALLBACK_COLOR;
    box.appendChild(el("div", "eap-onode__kicker", "Projeto"));
    box.appendChild(el("div", "eap-onode__nome", ROOT_LABEL));
    return box;
  }

  /* ============================================================
     Nível 1 — caixa de um GT (disciplina): branca, borda colorida,
     nome em destaque + contagem de pacotes. Colapsável (botão).
     ============================================================ */
  function buildDiscNode(disc, pacotes, cor) {
    var box = el("button", "eap-onode eap-onode--disc");
    box.type = "button";
    box.style.borderTopColor = cor;

    var pkgPanelId = "eap-pkgs-" + (disc.id || normalizar(disc.nome) || "x");
    box.setAttribute("aria-expanded", "true");
    box.setAttribute("aria-controls", pkgPanelId);

    box.appendChild(el("div", "eap-onode__nome", disc.nome || "(sem nome)"));

    var count = pacotes.length;
    var badge = el(
      "span",
      "badge eap-onode__count",
      count + (count === 1 ? " pacote" : " pacotes")
    );
    // Badge herda a cor do GT (texto colorido + fundo translúcido inline).
    badge.style.color = cor;
    box.appendChild(badge);

    // Seta de colapso (decorativa).
    var caret = el("span", "eap-onode__caret");
    caret.setAttribute("aria-hidden", "true");
    caret.textContent = "▾"; // ▾
    box.appendChild(caret);

    return { node: box, panelId: pkgPanelId };
  }

  /* ============================================================
     Nível 2 — caixa de um pacote de trabalho (branca, borda colorida)
     ============================================================ */
  function buildPacote(pac, cor) {
    var box = el("div", "eap-pkg");
    box.style.borderLeftColor = cor;

    var top = el("div", "eap-pkg__top");
    if (pac.id) top.appendChild(el("span", "eap-pkg__code", pac.id));
    top.appendChild(el("span", "eap-pkg__name", pac.nome || "(sem nome)"));
    box.appendChild(top);

    if (pac.descricao) {
      box.appendChild(el("div", "eap-pkg__desc", pac.descricao));
    }
    return box;
  }

  /* ============================================================
     Coluna de um GT: caixa do GT (Nível 1) + pilha de pacotes (N2).
     Espelha a .eqp-oc__col da Equipe (largura fixa, descida do
     barramento até a caixa via ::before do CSS).
     ============================================================ */
  function buildColuna(disc, pacotes, cor) {
    var col = el("div", "eap-oc__col");

    var inner = el("div", "eap-col is-expanded");

    var built = buildDiscNode(disc, pacotes, cor);
    var node = built.node;
    inner.appendChild(node);

    // Pilha de pacotes (Nível 2).
    var stack = el("div", "eap-stack");
    stack.id = built.panelId;
    if (!pacotes.length) {
      stack.appendChild(el("div", "eap-stack__empty", "Sem pacotes cadastrados."));
    } else {
      pacotes.forEach(function (p) {
        stack.appendChild(buildPacote(p, cor));
      });
    }
    inner.appendChild(stack);

    // Colapsar/expandir ao clicar na caixa do GT.
    node.addEventListener("click", function () {
      var expanded = node.getAttribute("aria-expanded") === "true";
      var next = !expanded;
      node.setAttribute("aria-expanded", next ? "true" : "false");
      inner.classList.toggle("is-expanded", next);
      inner.classList.toggle("is-collapsed", !next);
    });

    col.appendChild(inner);
    return col;
  }

  /* ============================================================
     Render principal
     ============================================================ */
  function render(mount, data) {
    ensureStyles();
    data = data || {};

    // A EAP deriva diretamente do cronograma: disciplinas e tarefas
    // são a fonte de verdade; não existe estado separado em data.eap.
    var crono = data.cronograma || {};
    var disciplinas = (crono.disciplinas) || [];
    var tarefas = (crono.tarefas) || [];

    mount.innerHTML = ""; // limpa placeholder

    var totalPacotes = tarefas.length;
    mount.appendChild(buildHeader(totalPacotes, disciplinas.length));

    if (!disciplinas.length) {
      mount.appendChild(
        el("div", "empty", "Nenhuma disciplina cadastrada no cronograma.")
      );
      return;
    }

    var idx = buildColorIndex(crono);
    var mapaPacotes = pacotesDeCronograma(tarefas);

    // Container rolável que abriga o organograma (mesmo padrão da Equipe).
    var scroller = el("div", "eap-oc-scroll");
    scroller.setAttribute("role", "group");
    scroller.setAttribute("aria-label", "Organograma da EAP");

    var oc = el("div", "eap-oc");

    // Nível 0 — raiz, com descida vertical até o barramento.
    var temAbaixo = disciplinas.length > 0;
    var l0 = el("div", "eap-oc__lvl" + (temAbaixo ? " eap-oc__lvl--drop" : ""));
    l0.appendChild(buildRootNode());
    oc.appendChild(l0);

    // Nível 1 + 2 — fileira dos GTs com barramento horizontal.
    var row = el(
      "div",
      "eap-oc__row" + (disciplinas.length === 1 ? " is-single" : "")
    );
    disciplinas.forEach(function (disc) {
      var pacotes = mapaPacotes[disc.id] || [];
      var cor = corDaDisciplina(disc, idx);
      row.appendChild(buildColuna(disc, pacotes, cor));
    });
    oc.appendChild(row);

    scroller.appendChild(oc);
    mount.appendChild(scroller);

    // Botão "Expandir/Recolher tudo".
    var toggle = mount.querySelector(".eap-toggle-all");
    if (toggle) {
      toggle.addEventListener("click", function () {
        var cols = mount.querySelectorAll(".eap-col");
        var anyCollapsed = Array.prototype.some.call(cols, function (c) {
          return c.classList.contains("is-collapsed");
        });
        Array.prototype.forEach.call(cols, function (c) {
          c.classList.toggle("is-collapsed", !anyCollapsed);
          c.classList.toggle("is-expanded", anyCollapsed);
          var n = c.querySelector(".eap-onode--disc");
          if (n) n.setAttribute("aria-expanded", anyCollapsed ? "true" : "false");
        });
        toggle.textContent = anyCollapsed ? "Recolher tudo" : "Expandir tudo";
      });
    }
  }

  /* ============================================================
     Registro no app + exportação para teste
     ============================================================ */
  if (typeof window !== "undefined" && window.Gestao && window.Gestao.onTab) {
    window.Gestao.onTab("tab-eap", render);
  }

  // Exporta funções puras para teste em Node (sem afetar o browser).
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      normalizar: normalizar,
      buildColorIndex: buildColorIndex,
      corDaDisciplina: corDaDisciplina,
      pacotesPorDisciplina: pacotesPorDisciplina,
      contarPacotes: contarPacotes,
      FALLBACK_COLOR: FALLBACK_COLOR
    };
  }
})();
