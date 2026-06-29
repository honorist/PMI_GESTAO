/* ============================================================
   disciplinas.js — Módulo "Disciplinas"
   ------------------------------------------------------------
   Navegação por disciplina (sub-abas) que integra, para cada
   disciplina: cronograma (tarefas), EAP (pacotes de trabalho),
   contratações (fornecedores) e o avanço/contagem de status.

   Registra-se via Gestao.onTab('tab-disciplinas', render).
   As tarefas aqui são SÓ LEITURA — a edição é na aba Cronograma
   (há botão "editar no cronograma" via Gestao.showTab).

   Casamento EAP × cronograma: por id; se não bater (ex.: cronograma
   "conteudo" vs. EAP "conteudo-e-programacao"), tenta por nome
   normalizado / prefixo. Disciplinas sem par na EAP (ex.:
   "encerramento") simplesmente não exibem pacotes.

   Segurança: todo valor vai por textContent / createElement.
   ============================================================ */

(function () {
  "use strict";

  /* ---- Rótulos e cores de status ---- */
  var STATUS_LABEL = {
    concluido: "Concluído",
    andamento: "Em andamento",
    pendente: "Pendente"
  };
  var STATUS_BADGE = {
    concluido: "green",
    andamento: "blue",
    pendente: "muted"
  };

  // Disciplina atualmente selecionada (persiste durante a sessão de view).
  var _selecionada = null;

  // Referências para re-render a partir de handlers internos (ex.: líder).
  var _mountRef = null;
  var _dataRef = null;

  /* ============================================================
     Injeção de CSS (uma única vez)
     ============================================================ */
  function ensureStyles() {
    if (document.getElementById("dsc-css")) return;
    var link = document.createElement("link");
    link.id = "dsc-css";
    link.rel = "stylesheet";
    link.href = "css/disciplinas.css";
    document.head.appendChild(link);
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

  function badge(cor, texto) {
    return el("span", "badge " + (cor || "muted"), texto);
  }

  // Resolve o nome de um membro da equipe pelo id (ou string de nome) guardado
  // em disc.lider. Aceita tanto {id, nome} quanto {id, name}.
  function nomeMembro(membros, liderId) {
    if (!liderId) return null;
    var liderStr = String(liderId);
    var m = (membros || []).filter(function (mb) {
      return (
        String(mb.id) === liderStr ||
        (mb.nome && mb.nome === liderStr) ||
        (mb.name && mb.name === liderStr)
      );
    })[0];
    return m ? (m.nome || m.name || liderStr) : liderStr;
  }

  // Formata 'AAAA-MM-DD' via Gestao.fmtData (com fallback) ou "—".
  function fmtData(iso) {
    if (!iso) return "—";
    if (window.Gestao && window.Gestao.fmtData) return window.Gestao.fmtData(iso);
    return String(iso);
  }

  /* ============================================================
     Casamento EAP × disciplina do cronograma
     ============================================================ */

  // Normaliza nome para comparação: minúsculas, sem acentos, sem
  // conectores ("e", "de"), só letras/números.
  function normalizar(nome) {
    return String(nome || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // remove acentos
      .replace(/\b(e|de|da|do|das|dos)\b/g, " ") // conectores
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  // Encontra a disciplina da EAP correspondente a uma do cronograma.
  // 1) por id exato; 2) por nome normalizado igual ou prefixo.
  function acharDisciplinaEAP(discCron, eap) {
    var lista = (eap && eap.disciplinas) || [];
    // 1) id exato
    var porId = lista.filter(function (e) {
      return e.id === discCron.id;
    })[0];
    if (porId) return porId;

    // 2) nome normalizado: igualdade ou um prefixo do outro
    var alvo = normalizar(discCron.nome);
    if (!alvo) return null;
    return (
      lista.filter(function (e) {
        var n = normalizar(e.nome);
        return n === alvo || n.indexOf(alvo) === 0 || alvo.indexOf(n) === 0;
      })[0] || null
    );
  }

  /* ============================================================
     Agregações por disciplina
     ============================================================ */

  function tarefasDaDisciplina(cron, discId) {
    return (cron.tarefas || []).filter(function (t) {
      return t.disciplinaId === discId;
    });
  }

  function contarStatus(tarefas) {
    var c = { concluido: 0, andamento: 0, pendente: 0, total: tarefas.length };
    tarefas.forEach(function (t) {
      if (c[t.status] !== undefined) c[t.status] += 1;
    });
    return c;
  }

  function pctConcluido(tarefas) {
    if (!tarefas.length) return 0;
    var done = tarefas.filter(function (t) {
      return t.status === "concluido";
    }).length;
    return Math.round((done / tarefas.length) * 100);
  }

  // Pacotes da EAP ligados à disciplina (já resolvida na EAP).
  function pacotesDaDisciplina(eap, eapDiscId) {
    if (!eapDiscId) return [];
    return ((eap && eap.pacotes) || []).filter(function (p) {
      return p.disciplinaId === eapDiscId;
    });
  }

  // Fornecedores/contratações ligados à disciplina do cronograma.
  // Tenta o id do cronograma e o id resolvido da EAP (cobre os dois
  // esquemas de disciplinaId usados nos seeds).
  function contratacoesDaDisciplina(contr, discId, eapDiscId) {
    var alvos = {};
    if (discId) alvos[discId] = true;
    if (eapDiscId) alvos[eapDiscId] = true;
    return ((contr && contr.fornecedores) || []).filter(function (f) {
      return alvos[f.disciplinaId];
    });
  }

  /* ============================================================
     Cabeçalho padrão da aba (logo + título + cartão de GTs)
     ============================================================ */
  function buildHeader(nGTs) {
    var Gestao = window.Gestao;
    var right = Gestao.headerStat({
      label: "Grupos",
      value: String(nGTs),
      sub: nGTs === 1 ? "grupo de trabalho" : "grupos de trabalho",
      accent: true
    });

    return Gestao.pageHeader({
      eyebrow: "DISCIPLINAS · SUMMIT POA PMIRS 2026",
      title: "Grupos de trabalho",
      subtitle: "Acompanhe tarefas, EAP e contratações de cada GT",
      right: right
    });
  }

  /* ============================================================
     Breadcrumb de contexto (UI-11)
     ============================================================ */
  function buildBreadcrumb(discNome) {
    var bc = el("div", "breadcrumb");
    bc.style.cssText =
      "display:flex;gap:6px;align-items:center;font-size:.82rem;" +
      "color:var(--muted);margin-bottom:12px;";

    var spanPlan = el("span", null, "Planejamento");
    spanPlan.style.cssText = "cursor:pointer;color:var(--purple-2);";
    spanPlan.addEventListener("click", function () {
      if (window.Gestao && window.Gestao.showTab) {
        window.Gestao.showTab("tab-cronograma");
      }
    });
    bc.appendChild(spanPlan);

    var sep1 = el("span", null, "›");
    sep1.style.color = "var(--muted)";
    bc.appendChild(sep1);

    bc.appendChild(el("span", null, "Disciplinas"));

    var sep2 = el("span", null, "›");
    sep2.style.color = "var(--muted)";
    bc.appendChild(sep2);

    bc.appendChild(el("span", null, discNome || "—"));

    return bc;
  }

  /* ============================================================
     Sub-navegação (pílulas das disciplinas)
     ============================================================ */
  function buildNav(disciplinas, onSelect) {
    var nav = el("nav", "dsc-nav");
    nav.setAttribute("aria-label", "Disciplinas");

    disciplinas.forEach(function (d) {
      var btn = el("button", "dsc-tab", null);
      btn.type = "button";
      var ativo = d.id === _selecionada;
      btn.setAttribute("aria-pressed", ativo ? "true" : "false");

      var dot = el("span", "dsc-tab__dot");
      if (d.cor) dot.style.background = d.cor;
      btn.appendChild(dot);
      btn.appendChild(document.createTextNode(d.nome));

      // Disciplina ativa ganha fundo na sua cor.
      if (ativo && d.cor) btn.style.background = d.cor;

      btn.addEventListener("click", function () {
        onSelect(d.id);
      });
      nav.appendChild(btn);
    });

    return nav;
  }

  /* ============================================================
     Cabeçalho colorido da disciplina + avanço
     ============================================================ */
  function buildHead(disc, status, pct, membros) {
    var head = el("div", "dsc-head");
    head.style.background = disc.cor || "var(--purple)";

    head.appendChild(el("h2", "dsc-head__title", disc.nome));
    head.appendChild(
      el(
        "p",
        "dsc-head__meta",
        status.total +
          (status.total === 1 ? " tarefa" : " tarefas") +
          " · " +
          pct +
          "% concluído"
      )
    );

    // Barra de avanço (branca sobre a cor da disciplina).
    var bar = el("div", "dsc-head__bar");
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-valuenow", String(pct));
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", "100");
    var fill = el("div", "dsc-head__fill");
    fill.style.width = Math.max(0, Math.min(100, pct)) + "%";
    bar.appendChild(fill);
    head.appendChild(bar);

    // Chips de contagem por status.
    var stats = el("div", "dsc-stats");
    stats.appendChild(badge("green", status.concluido + " concluídas"));
    stats.appendChild(badge("blue", status.andamento + " em andamento"));
    stats.appendChild(badge("muted", status.pendente + " pendentes"));
    head.appendChild(stats);

    // Linha de líder do GT (Func-21).
    var rowLider = el("div", "dsc-head__lider");
    var liderNomeAtual = nomeMembro(membros, disc.lider);
    var liderLabel = el("span", "dsc-head__lider-label", "Líder: ");
    var liderNomeEl = el("strong", null, liderNomeAtual || "Não definido");
    rowLider.appendChild(liderLabel);
    rowLider.appendChild(liderNomeEl);

    // Botão "Definir líder" — visível só quando não é readonly e há membros.
    var readonly = window.Gestao && typeof window.Gestao.podeEditar === "function"
      ? !window.Gestao.podeEditar()
      : false;
    if (!readonly && membros && membros.length) {
      var btnLider = el("button", "btn-ghost btn sm dsc-head__lider-btn", "Definir líder");
      btnLider.type = "button";
      btnLider.addEventListener("click", function () {
        var sel = document.createElement("select");
        sel.className = "dsc-head__lider-sel";

        var optVazio = document.createElement("option");
        optVazio.value = "";
        optVazio.textContent = "— sem líder —";
        sel.appendChild(optVazio);

        membros.forEach(function (mb) {
          var opt = document.createElement("option");
          var val = String(mb.id || mb.nome || mb.name || "");
          opt.value = val;
          opt.textContent = mb.nome || mb.name || val;
          if (val && val === String(disc.lider || "")) opt.selected = true;
          sel.appendChild(opt);
        });

        sel.addEventListener("change", function () {
          disc.lider = sel.value || null;
          if (window.Gestao && window.Gestao.save) window.Gestao.save();
          if (window.Gestao && window.Gestao.toast) {
            window.Gestao.toast("Líder definido com sucesso");
          }
          if (_mountRef && _dataRef) render(_mountRef, _dataRef);
        });

        rowLider.replaceChild(sel, btnLider);
      });
      rowLider.appendChild(btnLider);
    }

    head.appendChild(rowLider);

    return head;
  }

  /* ============================================================
     Seção: tabela de tarefas (somente leitura)
     ============================================================ */
  function buildTarefas(tarefas) {
    var card = el("div", "card dsc-section");

    var title = el("div", "dsc-section__title");
    title.appendChild(document.createTextNode("Tarefas"));
    var actions = el("div", "row");
    actions.appendChild(el("span", "dsc-section__count", tarefas.length + " itens"));
    var btn = el("button", "btn-ghost btn sm", "Editar no cronograma");
    btn.type = "button";
    btn.addEventListener("click", function () {
      if (window.Gestao && window.Gestao.showTab) {
        window.Gestao.showTab("tab-cronograma");
      }
    });
    actions.appendChild(btn);
    title.appendChild(actions);
    card.appendChild(title);

    if (!tarefas.length) {
      card.appendChild(el("div", "empty", "Sem tarefas nesta disciplina."));
      return card;
    }

    var wrap = el("div", "dsc-table-wrap");
    var table = el("table", "table compact");

    var thead = el("thead");
    var trh = el("tr");
    ["Tarefa", "Início", "Fim", "Status", "Responsável"].forEach(function (h) {
      trh.appendChild(el("th", null, h));
    });
    thead.appendChild(trh);
    table.appendChild(thead);

    var tbody = el("tbody");
    tarefas.forEach(function (t) {
      var tr = el("tr");

      // Nome (+ estrela se for marco)
      var tdNome = el("td");
      tdNome.appendChild(document.createTextNode(t.nome));
      if (t.marco) {
        var star = el("span", "dsc-task-marco", "★");
        star.setAttribute("title", "Marco");
        star.setAttribute("aria-label", "Marco");
        tdNome.appendChild(star);
      }
      tr.appendChild(tdNome);

      tr.appendChild(el("td", null, fmtData(t.inicio)));
      tr.appendChild(el("td", null, fmtData(t.fim)));

      var tdStatus = el("td");
      tdStatus.appendChild(
        badge(STATUS_BADGE[t.status], STATUS_LABEL[t.status] || t.status)
      );
      tr.appendChild(tdStatus);

      tr.appendChild(el("td", null, t.responsavel || "—"));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    card.appendChild(wrap);

    return card;
  }

  /* ============================================================
     Seção: pacotes da EAP
     ============================================================ */
  function buildPacotes(pacotes, semPar, disc) {
    var card = el("div", "card dsc-section");

    var title = el("div", "dsc-section__title");
    title.appendChild(document.createTextNode("Pacotes de trabalho (EAP)"));
    title.appendChild(el("span", "dsc-section__count", pacotes.length + " itens"));
    card.appendChild(title);

    if (!pacotes.length) {
      var msg = semPar
        ? "Esta disciplina não tem correspondência na EAP."
        : "Sem pacotes de trabalho cadastrados.";
      card.appendChild(el("div", "empty", msg));
      return card;
    }

    // Diagrama de aranha (radial): disciplina no centro, pacotes ao redor.
    var cor = (disc && disc.cor) || "#36177B";
    var n = pacotes.length;
    var boxW = 152;
    var R = Math.max(180, Math.round(n * 26));
    var size = 2 * R + boxW + 100;
    var cx = size / 2;
    var cy = size / 2;

    var scroller = el("div", "dsc-spider-scroll");
    var wrap = el("div", "dsc-spider");
    wrap.style.width = size + "px";
    wrap.style.height = size + "px";
    wrap.style.setProperty("--dsc-cor", cor);

    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "dsc-spider__lines");
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    svg.setAttribute("viewBox", "0 0 " + size + " " + size);

    var boxes = [];
    pacotes.forEach(function (p, i) {
      var ang = ((-90 + (i * 360) / n) * Math.PI) / 180;
      var x = cx + R * Math.cos(ang);
      var y = cy + R * Math.sin(ang);

      var ln = document.createElementNS(NS, "line");
      ln.setAttribute("x1", cx);
      ln.setAttribute("y1", cy);
      ln.setAttribute("x2", x);
      ln.setAttribute("y2", y);
      ln.setAttribute("stroke", cor);
      ln.setAttribute("stroke-width", "2");
      ln.setAttribute("stroke-opacity", "0.4");
      svg.appendChild(ln);

      var box = el("div", "dsc-spider__pkg");
      box.style.left = x - boxW / 2 + "px";
      box.style.top = y + "px";
      box.style.width = boxW + "px";
      var top = el("div", "dsc-spider__pkg-top");
      if (p.id) top.appendChild(el("span", "dsc-spider__code", p.id));
      top.appendChild(el("span", "dsc-spider__name", p.nome || "(sem nome)"));
      box.appendChild(top);
      if (p.descricao) box.title = p.descricao; // detalhe no hover
      boxes.push(box);
    });

    wrap.appendChild(svg);
    boxes.forEach(function (b) { wrap.appendChild(b); });

    var center = el("div", "dsc-spider__center");
    center.style.left = cx + "px";
    center.style.top = cy + "px";
    center.appendChild(el("span", "dsc-spider__center-name", (disc && disc.nome) || "Disciplina"));
    center.appendChild(
      el("span", "dsc-spider__center-sub", n + (n === 1 ? " pacote" : " pacotes"))
    );
    wrap.appendChild(center);

    scroller.appendChild(wrap);
    card.appendChild(scroller);

    return card;
  }

  /* ============================================================
     Seção: contratações ligadas à disciplina
     ============================================================ */
  function buildContratacoes(fornecedores) {
    var card = el("div", "card dsc-section");

    var title = el("div", "dsc-section__title");
    title.appendChild(document.createTextNode("Contratações"));
    title.appendChild(
      el("span", "dsc-section__count", fornecedores.length + " itens")
    );
    card.appendChild(title);

    if (!fornecedores.length) {
      card.appendChild(el("div", "empty", "Nenhuma contratação ligada."));
      return card;
    }

    var table = el("table", "table compact");
    var thead = el("thead");
    var trh = el("tr");
    ["Item", "Status", "Valor"].forEach(function (h, i) {
      var th = el("th", i === 2 ? "num" : null, h);
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);

    var tbody = el("tbody");
    fornecedores.forEach(function (f) {
      var tr = el("tr");

      // Nome do fornecedor, ou a categoria/observação quando vazio (seed).
      var rotulo = f.nome || f.categoria || f.observacao || "—";
      var tdItem = el("td");
      tdItem.appendChild(document.createTextNode(rotulo));
      if (f.nome && f.observacao) {
        tdItem.appendChild(el("div", "muted-text", f.observacao));
      } else if (!f.nome && f.categoria && f.observacao) {
        tdItem.appendChild(el("div", "muted-text", f.observacao));
      }
      tr.appendChild(tdItem);

      var tdStatus = el("td");
      tdStatus.appendChild(
        badge(contrBadge(f.status), contrLabel(f.status))
      );
      tr.appendChild(tdStatus);

      var valorTxt =
        window.Gestao && window.Gestao.fmtBRL
          ? window.Gestao.fmtBRL(f.valor || 0)
          : String(f.valor || 0);
      tr.appendChild(el("td", "num", valorTxt));

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    card.appendChild(table);

    return card;
  }

  function contrLabel(status) {
    if (status === "fechado") return "Fechado";
    if (status === "negociando") return "Negociando";
    if (status === "a_contratar") return "A contratar";
    return status || "—";
  }

  function contrBadge(status) {
    if (status === "fechado") return "green";
    if (status === "negociando") return "orange";
    return "muted";
  }

  /* ============================================================
     Painel completo de uma disciplina
     ============================================================ */
  function buildPainel(disc, data) {
    var cron = data.cronograma || {};
    var eap = data.eap || {};
    var contr = data.contratacoes || {};
    var membros = (data.equipe && data.equipe.membros) || [];

    var tarefas = tarefasDaDisciplina(cron, disc.id);
    var status = contarStatus(tarefas);
    var pct = pctConcluido(tarefas);

    var eapDisc = acharDisciplinaEAP(disc, eap);
    var eapDiscId = eapDisc ? eapDisc.id : null;
    var pacotes = pacotesDaDisciplina(eap, eapDiscId);
    var fornecedores = contratacoesDaDisciplina(contr, disc.id, eapDiscId);

    var painel = el("div");
    painel.appendChild(buildHead(disc, status, pct, membros));
    painel.appendChild(buildTarefas(tarefas));
    painel.appendChild(buildPacotes(pacotes, !eapDisc, disc));
    painel.appendChild(buildContratacoes(fornecedores));
    return painel;
  }

  /* ============================================================
     Render principal
     ============================================================ */
  function render(mount, data) {
    ensureStyles();
    data = data || {};
    // Armazena refs para re-render a partir de handlers internos (ex.: líder).
    _mountRef = mount;
    _dataRef = data;
    var disciplinas = (data.cronograma && data.cronograma.disciplinas) || [];

    mount.innerHTML = ""; // limpa placeholder

    // Cabeçalho padrão (estilo Cronograma) — topo da aba, acima da
    // sub-navegação de GTs. Cartão à direita: nº de grupos de trabalho.
    mount.appendChild(buildHeader(disciplinas.length));

    if (!disciplinas.length) {
      mount.appendChild(el("div", "empty", "Nenhuma disciplina cadastrada."));
      return;
    }

    // Garante uma seleção válida (default: primeira disciplina).
    var existe = disciplinas.some(function (d) {
      return d.id === _selecionada;
    });
    if (!existe) _selecionada = disciplinas[0].id;

    // Sub-navegação — ao selecionar, re-renderiza só este módulo.
    mount.appendChild(
      buildNav(disciplinas, function (id) {
        _selecionada = id;
        render(mount, data);
      })
    );

    // Painel da disciplina selecionada (com breadcrumb de contexto acima).
    var disc = disciplinas.filter(function (d) {
      return d.id === _selecionada;
    })[0];
    if (disc) {
      mount.appendChild(buildBreadcrumb(disc.nome));
      mount.appendChild(buildPainel(disc, data));
    }
  }

  /* ============================================================
     Registro no app + exportação para teste
     ============================================================ */
  if (typeof window !== "undefined" && window.Gestao && window.Gestao.onTab) {
    window.Gestao.onTab("tab-disciplinas", render);
  }

  // Exporta funções puras para teste em Node (sem afetar o browser).
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      normalizar: normalizar,
      acharDisciplinaEAP: acharDisciplinaEAP,
      tarefasDaDisciplina: tarefasDaDisciplina,
      contarStatus: contarStatus,
      pctConcluido: pctConcluido,
      pacotesDaDisciplina: pacotesDaDisciplina,
      contratacoesDaDisciplina: contratacoesDaDisciplina,
      contrLabel: contrLabel,
      contrBadge: contrBadge
    };
  }
})();
