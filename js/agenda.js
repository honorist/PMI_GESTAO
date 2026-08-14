/* ============================================================
   agenda.js — Módulo Agenda da GP (aba "Agenda da GP")
   ------------------------------------------------------------
   Duas janelas para o Google Agenda da Gerente de Projetos:
   a agenda pública (consulta) e a página de agendamento de
   horários (reserva self-service).

   - Sem CRUD, sem Gestao.save(), sem chave de domínio no estado.
     Nada aqui é persistido — quem guarda os agendamentos é o
     Google; do nosso lado é conteúdo estático embutido.
   - Os iframes só são criados quando a aba é aberta (Gestao.onTab
     só chama init() no primeiro render da aba), então o Google
     não é contatado no boot do app.

   Contrato consumido (window.Gestao):
     Gestao.onTab(id, renderFn) · Gestao.pageHeader(opts)

   Requisito externo: a agenda precisa estar compartilhada
   publicamente no Google, senão o iframe renderiza vazio. Daí o
   link de fallback — sem ele o usuário veria um retângulo branco
   e nenhuma pista do motivo. O bloco de agendamento tem o mesmo
   cuidado: enquanto BOOKING_SRC não for preenchido, mostra o
   passo a passo em vez de um quadro vazio.
   ============================================================ */

(function () {
  "use strict";

  var TAB_ID = "tab-agenda";

  var CAL_SRC =
    "https://calendar.google.com/calendar/embed" +
    "?src=germania.penho%40pmirs.org.br" +
    "&ctz=America%2FSao_Paulo";

  // Página de agendamento ("Agendamento de horários") da GP.
  // COMO OBTER: no Google Agenda de germania.penho@pmirs.org.br →
  //   Criar ▸ "Agendamento de horários" → configurar duração e
  //   disponibilidade → botão "Compartilhar" → copiar o link que
  //   termina em "?gv=true".
  // Deixe "" enquanto não existir — a aba exibe as instruções no
  // lugar do quadro. Atenção: não serve a URL de calendar/embed
  // acima; tem de ser a de calendar/appointments/schedules.
  var BOOKING_SRC = "";

  // Cobre tanto o valor vazio quanto o engano de colar a URL do
  // calendário comum, que renderizaria um segundo calendário.
  function bookingConfigurado() {
    return /\/calendar\/appointments\/schedules\//.test(BOOKING_SRC);
  }

  /* ============================================================
     Injeção do CSS do módulo (uma única vez)
     ============================================================ */
  function ensureStyles() {
    if (document.getElementById("agd-css")) return;
    var link = document.createElement("link");
    link.id = "agd-css";
    link.rel = "stylesheet";
    link.href = "css/agenda.css?v=2";
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
      subtitle: "Compromissos da Gerente de Projetos e agendamento de horários"
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

    var acoes = el("span", "agd-barra-acoes");

    // Atalho para a seção de agendamento, que fica abaixo do
    // calendário. app.js não usa roteamento por hash, então a
    // âncora não interfere na troca de abas.
    var agendar = el("a", "agd-link", "Agendar horário ↓");
    agendar.href = "#agd-agendar";
    acoes.appendChild(agendar);

    var abrir = el("a", "agd-link", "Abrir no Google Agenda ↗");
    abrir.href = CAL_SRC;
    abrir.target = "_blank";
    abrir.rel = "noopener noreferrer";
    acoes.appendChild(abrir);

    bar.appendChild(acoes);

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
     Seção de agendamento de horários
     ------------------------------------------------------------
     Enquanto BOOKING_SRC não estiver configurado, mostra o passo
     a passo em vez de um iframe quebrado — a aba se autoexplica
     a quem for configurar.
     ============================================================ */
  function buildInstrucoes() {
    var card = el("div", "agd-vazio");
    card.appendChild(
      el("p", "agd-vazio-titulo", "Agendamento ainda não configurado.")
    );
    card.appendChild(
      el(
        "p",
        null,
        "Para liberar a reserva de horários, crie a página no Google Agenda da GP e cole o link em BOOKING_SRC (js/agenda.js):"
      )
    );

    var passos = document.createElement("ol");
    passos.className = "agd-vazio-passos";
    [
      "No Google Agenda de germania.penho@pmirs.org.br, clique em Criar ▸ \"Agendamento de horários\".",
      "Defina a duração da conversa e as janelas de disponibilidade.",
      "Clique em \"Compartilhar\" e copie o link que termina em \"?gv=true\".",
      "Cole esse link na constante BOOKING_SRC, no topo de js/agenda.js."
    ].forEach(function (texto) {
      passos.appendChild(el("li", null, texto));
    });
    card.appendChild(passos);

    return card;
  }

  function buildAgendamento() {
    var sec = el("section", "agd-secao");
    sec.id = "agd-agendar";
    sec.appendChild(el("h2", "agd-secao-titulo", "Agendar um horário"));

    if (!bookingConfigurado()) {
      sec.appendChild(buildInstrucoes());
      return sec;
    }

    sec.appendChild(
      el(
        "p",
        "agd-nota",
        "Escolha um horário livre da GP. A confirmação chega por e-mail e o compromisso entra direto na agenda dela."
      )
    );

    var wrap = el("div", "agd-quadro");
    var frame = document.createElement("iframe");
    frame.className = "agd-frame agd-frame--booking";
    frame.src = BOOKING_SRC;
    frame.title = "Agendamento de horários com a Gerente de Projetos";
    frame.loading = "lazy";
    frame.referrerPolicy = "no-referrer-when-downgrade";
    frame.setAttribute("frameborder", "0");
    wrap.appendChild(frame);
    sec.appendChild(wrap);

    return sec;
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
    root.appendChild(buildAgendamento());
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
