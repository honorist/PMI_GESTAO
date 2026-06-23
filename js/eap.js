/* ============================================================
   eap.js — Módulo "EAP" (Estrutura Analítica do Projeto)
   ------------------------------------------------------------
   Desenha a EAP como um ORGANOGRAMA top-down (árvore de 3 níveis):

     Nível 0  →  raiz: "Summit POA PMIRS 2026" (caixa roxa)
     Nível 1  →  cada disciplina / GT (caixa colorida + contagem)
     Nível 2  →  pacotes de trabalho da disciplina (caixas brancas)

   Conectores desenhados em CSS (pseudo-elementos): barramento
   horizontal sob a raiz, descidas verticais até cada disciplina e
   espinha vertical + ramos horizontais até cada pacote.

   Cores: usa a `cor` de cada disciplina vinda de
   Gestao.data.cronograma.disciplinas, casada por id e, como
   fallback, por nome normalizado (sem acentos/conectores). Sem cor
   conhecida → roxo da marca (#36177B).

   Somente leitura. Disciplina colapsável (clique no nó) — começa
   expandida. Container com scroll horizontal para caber os 8 GTs.

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

  /* ============================================================
     Cabeçalho da aba
     ============================================================ */
  function buildHeader(totalPacotes, totalDisc) {
    var head = el("header", "eap-header");

    head.appendChild(el("h2", "eap-title", "EAP — Estrutura Analítica do Projeto"));

    var subTxt =
      totalPacotes +
      (totalPacotes === 1 ? " pacote de trabalho" : " pacotes de trabalho") +
      " · " +
      totalDisc +
      (totalDisc === 1 ? " grupo de trabalho" : " grupos de trabalho");
    head.appendChild(el("p", "eap-subtitle", subTxt));

    return head;
  }

  /* ============================================================
     Nível 0 — nó raiz
     ============================================================ */
  function buildRoot() {
    var wrap = el("div", "eap-root-wrap");
    var node = el("div", "eap-node eap-node--root");
    node.appendChild(el("span", "eap-node__kicker", "Projeto"));
    node.appendChild(el("span", "eap-node__title", ROOT_LABEL));
    wrap.appendChild(node);
    return wrap;
  }

  /* ============================================================
     Nível 2 — caixa de um pacote de trabalho
     ============================================================ */
  function buildPacote(pac) {
    var box = el("div", "eap-pkg");

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
     Nível 1 + 2 — coluna de uma disciplina (nó + pilha de pacotes)
     ============================================================ */
  function buildColuna(disc, pacotes, cor) {
    var col = el("div", "eap-col");

    // --- Nó da disciplina (botão colapsável) ---
    var node = el("button", "eap-node eap-node--disc");
    node.type = "button";
    node.style.setProperty("--disc-cor", cor);

    var pkgPanelId = "eap-pkgs-" + (disc.id || normalizar(disc.nome) || "x");
    node.setAttribute("aria-expanded", "true");
    node.setAttribute("aria-controls", pkgPanelId);

    var titleRow = el("span", "eap-node__row");
    titleRow.appendChild(el("span", "eap-node__title", disc.nome || "(sem nome)"));
    var count = pacotes.length;
    var badge = el(
      "span",
      "badge eap-node__badge",
      count + (count === 1 ? " pacote" : " pacotes")
    );
    titleRow.appendChild(badge);
    node.appendChild(titleRow);

    // Seta de colapso (decorativa).
    var caret = el("span", "eap-node__caret");
    caret.setAttribute("aria-hidden", "true");
    caret.textContent = "▾";
    node.appendChild(caret);

    col.appendChild(node);

    // --- Pilha de pacotes (Nível 2) ---
    var stack = el("div", "eap-stack");
    stack.id = pkgPanelId;

    if (!pacotes.length) {
      stack.appendChild(el("div", "eap-stack__empty", "Sem pacotes cadastrados."));
    } else {
      pacotes.forEach(function (p) {
        stack.appendChild(buildPacote(p));
      });
    }
    col.appendChild(stack);

    // Colapsar/expandir ao clicar no nó.
    node.addEventListener("click", function () {
      var expanded = node.getAttribute("aria-expanded") === "true";
      var next = !expanded;
      node.setAttribute("aria-expanded", next ? "true" : "false");
      col.classList.toggle("is-collapsed", !next);
    });

    return col;
  }

  /* ============================================================
     Render principal
     ============================================================ */
  function render(mount, data) {
    ensureStyles();
    data = data || {};
    var eap = data.eap || {};
    var disciplinas = (eap && eap.disciplinas) || [];

    mount.innerHTML = ""; // limpa placeholder

    var totalPacotes = contarPacotes(eap);
    mount.appendChild(buildHeader(totalPacotes, disciplinas.length));

    if (!disciplinas.length) {
      mount.appendChild(
        el("div", "empty", "Nenhuma disciplina cadastrada na EAP.")
      );
      return;
    }

    var idx = buildColorIndex(data.cronograma);
    var mapaPacotes = pacotesPorDisciplina(eap);

    // Container rolável que abriga o organograma.
    var scroller = el("div", "eap-scroller");
    scroller.setAttribute("role", "group");
    scroller.setAttribute("aria-label", "Organograma da EAP");

    var tree = el("div", "eap-tree");

    // Nível 0
    tree.appendChild(buildRoot());

    // Linha das disciplinas (Nível 1 + 2)
    var row = el("div", "eap-branches");
    if (disciplinas.length === 1) row.classList.add("is-single");
    disciplinas.forEach(function (disc) {
      var pacotes = mapaPacotes[disc.id] || [];
      var cor = corDaDisciplina(disc, idx);
      row.appendChild(buildColuna(disc, pacotes, cor));
    });
    tree.appendChild(row);

    scroller.appendChild(tree);
    mount.appendChild(scroller);
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
