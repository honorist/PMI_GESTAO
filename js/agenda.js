/* ============================================================
   agenda.js — Módulo Agenda da GP (aba "Agenda da GP")
   ------------------------------------------------------------
   Janela somente-leitura para a agenda pública da Gerente de
   Projetos no Google Agenda.

   - Sem CRUD, sem Gestao.save(), sem chave de domínio no estado.
     Nada aqui é persistido — é conteúdo estático embutido.
   - O iframe só é criado quando a aba é aberta (Gestao.onTab só
     chama init() no primeiro render da aba), então o Google não
     é contatado no boot do app.

   Contrato consumido (window.Gestao):
     Gestao.onTab(id, renderFn) · Gestao.pageHeader(opts)

   Requisito externo: a agenda precisa estar compartilhada
   publicamente no Google, senão o iframe renderiza vazio. Daí o
   link de fallback — sem ele o usuário veria um retângulo branco
   e nenhuma pista do motivo.
   ============================================================ */

(function () {
  "use strict";

  var TAB_ID = "tab-agenda";

  var CAL_SRC =
    "https://calendar.google.com/calendar/embed" +
    "?src=germania.penho%40pmirs.org.br" +
    "&ctz=America%2FSao_Paulo";

  /* ============================================================
     Injeção do CSS do módulo (uma única vez)
     ============================================================ */
  function ensureStyles() {
    if (document.getElementById("agd-css")) return;
    var link = document.createElement("link");
    link.id = "agd-css";
    link.rel = "stylesheet";
    link.href = "css/agenda.css";
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
     Cabeçalho da aba
     ============================================================ */
  function buildHeader() {
    return window.Gestao.pageHeader({
      eyebrow: "AGENDA · SUMMIT POA PMIRS 2026",
      title: "Agenda da GP",
      subtitle: "Compromissos da Gerente de Projetos"
    });
  }

  /* ============================================================
     Barra superior: nota + link externo
     ------------------------------------------------------------
     Usa <a>, não <button>: aplicarReadonly() esconde botões em
     abas não editáveis, e este link deve sobreviver a todo perfil.
     ============================================================ */
  function buildBarra() {
    var bar = el("div", "spread");
    bar.appendChild(
      el("span", "muted-text", "Agenda pública da Gerente de Projetos, em horário de Brasília.")
    );

    var abrir = el("a", "agd-link", "Abrir no Google Agenda ↗");
    abrir.href = CAL_SRC;
    abrir.target = "_blank";
    abrir.rel = "noopener noreferrer";
    bar.appendChild(abrir);

    return bar;
  }

  /* ============================================================
     Quadro da agenda
     ============================================================ */
  function buildQuadro() {
    var wrap = el("div", "agd-quadro");

    var frame = document.createElement("iframe");
    frame.className = "agd-frame";
    frame.src = CAL_SRC;
    // Sem title o leitor de tela anuncia apenas "iframe".
    frame.title = "Agenda da Gerente de Projetos no Google Agenda";
    frame.loading = "lazy";
    frame.referrerPolicy = "no-referrer-when-downgrade";
    frame.setAttribute("frameborder", "0");
    frame.setAttribute("scrolling", "no");
    wrap.appendChild(frame);

    return wrap;
  }

  function buildNotaFallback() {
    var nota = el("p", "agd-nota");
    nota.appendChild(
      document.createTextNode("Quadro em branco? A agenda precisa estar compartilhada publicamente no Google. ")
    );
    var a = el("a", "agd-link", "Abrir em nova aba");
    a.href = CAL_SRC;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    nota.appendChild(a);
    return nota;
  }

  /* ============================================================
     Render principal
     ============================================================ */
  function render(mount) {
    clear(mount);
    mount.appendChild(buildHeader());

    var root = el("div", "stack");
    root.appendChild(buildBarra());
    root.appendChild(buildQuadro());
    root.appendChild(buildNotaFallback());
    mount.appendChild(root);
  }

  /* ============================================================
     Registro no app
     ============================================================ */
  function init(mountEl) {
    ensureStyles();
    render(mountEl);
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
})();
