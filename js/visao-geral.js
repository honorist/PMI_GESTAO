/* ============================================================
   visao-geral.js — Módulo "Visão Geral" (dashboard do evento)
   ------------------------------------------------------------
   Panorama de leitura do PMIRS Summit 2026. Registra-se via
   Gestao.onTab('tab-visao', render). Não faz CRUD.

   Conteúdo:
   1. Hero: nome/data do evento + contagem regressiva.
   2. KPIs: % concluído, tarefas por status, marcos, saldo
      financeiro, contratos por status.
   3. Avanço por disciplina (barras coloridas, risco primeiro).
   4. Próximos prazos (8 tarefas não concluídas mais próximas).
   5. Timeline dos próximos marcos.
   6. Links rápidos para outras abas.

   Segurança: todo valor vai por textContent / createElement;
   innerHTML só para markup estático sem dados.
   ============================================================ */

(function () {
  "use strict";

  /* ---- Constantes de domínio ---- */
  var EVENTO_NOME = "PMIRS Summit 2026";
  var EVENTO_LOCAL = "Tecnopuc · Porto Alegre";
  var EVENTO_DATA_LABEL = "13–14 nov 2026";
  // Data-âncora para a contagem regressiva (1º dia do evento, local).
  var EVENTO_INICIO = "2026-11-13";
  var MAX_PRAZOS = 8;
  var MAX_MARCOS = 6;
  var MS_DIA = 24 * 60 * 60 * 1000;
  var MESES_ABREV = [
    "jan", "fev", "mar", "abr", "mai", "jun",
    "jul", "ago", "set", "out", "nov", "dez"
  ];

  /* ============================================================
     Injeção de CSS (uma única vez)
     ============================================================ */
  function ensureStyles() {
    if (document.getElementById("vg-css")) return;
    var link = document.createElement("link");
    link.id = "vg-css";
    link.rel = "stylesheet";
    link.href = "css/visao-geral.css";
    document.head.appendChild(link);
  }

  /* ============================================================
     Helpers de data (sempre tratando ISO como data LOCAL)
     ============================================================ */

  // 'AAAA-MM-DD' -> Date local à meia-noite. Retorna null se inválida.
  function parseISO(iso) {
    if (!iso) return null;
    var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  // "Hoje" normalizado à meia-noite local (evita erro por hora do dia).
  function hojeLocal() {
    var d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  // Diferença em dias inteiros entre duas datas (b - a).
  function diffDias(a, b) {
    return Math.round((b.getTime() - a.getTime()) / MS_DIA);
  }

  // true quando a tarefa está atrasada (fim < hoje e não concluída).
  function estaAtrasada(tarefa, hoje) {
    if (tarefa.status === "concluido") return false;
    var fim = parseISO(tarefa.fim);
    return !!fim && fim.getTime() < hoje.getTime();
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

  // Barra de progresso reutilizável. pct é 0–100; cor é o fill.
  function barraProgresso(pct, cor, grande) {
    var wrap = el("div", "vg-bar" + (grande ? " is-lg" : ""));
    wrap.setAttribute("role", "progressbar");
    wrap.setAttribute("aria-valuenow", String(pct));
    wrap.setAttribute("aria-valuemin", "0");
    wrap.setAttribute("aria-valuemax", "100");
    var fill = el("div", "vg-bar__fill");
    fill.style.width = clampPct(pct) + "%";
    if (cor) fill.style.background = cor;
    wrap.appendChild(fill);
    return wrap;
  }

  function clampPct(n) {
    var v = Number(n);
    if (!isFinite(v)) return 0;
    return Math.max(0, Math.min(100, v));
  }

  /* ============================================================
     Agregações sobre os dados
     ============================================================ */

  // Contagem de tarefas por status.
  function contarStatus(tarefas) {
    var c = { concluido: 0, andamento: 0, pendente: 0, total: tarefas.length };
    tarefas.forEach(function (t) {
      if (c[t.status] !== undefined) c[t.status] += 1;
    });
    return c;
  }

  // % geral de tarefas concluídas (0 se não houver tarefas).
  function pctConcluido(tarefas) {
    if (!tarefas.length) return 0;
    var done = tarefas.filter(function (t) {
      return t.status === "concluido";
    }).length;
    return Math.round((done / tarefas.length) * 100);
  }

  // Soma segura de um campo numérico de uma lista.
  function soma(lista, campo) {
    return lista.reduce(function (acc, item) {
      var v = Number(item[campo]);
      return acc + (isFinite(v) ? v : 0);
    }, 0);
  }

  // Avanço por disciplina, ordenado por menor % (risco) primeiro.
  function avancoPorDisciplina(cronograma) {
    return (cronograma.disciplinas || [])
      .map(function (d) {
        var doDisc = (cronograma.tarefas || []).filter(function (t) {
          return t.disciplinaId === d.id;
        });
        return {
          id: d.id,
          nome: d.nome,
          cor: d.cor,
          total: doDisc.length,
          concluidas: doDisc.filter(function (t) {
            return t.status === "concluido";
          }).length,
          pct: pctConcluido(doDisc)
        };
      })
      .filter(function (d) {
        return d.total > 0; // ignora disciplinas sem tarefas
      })
      .sort(function (a, b) {
        // menor avanço primeiro; empate -> mais tarefas primeiro
        if (a.pct !== b.pct) return a.pct - b.pct;
        return b.total - a.total;
      });
  }

  // Próximas tarefas não concluídas com fim mais próximo.
  function proximosPrazos(cronograma, limite) {
    return (cronograma.tarefas || [])
      .filter(function (t) {
        return t.status !== "concluido" && parseISO(t.fim);
      })
      .sort(function (a, b) {
        return parseISO(a.fim).getTime() - parseISO(b.fim).getTime();
      })
      .slice(0, limite);
  }

  // Próximos marcos (marco=true) com data, a partir de hoje, por data.
  function proximosMarcos(cronograma, hoje, limite) {
    var futuros = [];
    var passados = [];
    (cronograma.tarefas || []).forEach(function (t) {
      if (!t.marco) return;
      var fim = parseISO(t.fim);
      if (!fim) return;
      (fim.getTime() >= hoje.getTime() ? futuros : passados).push(t);
    });
    var ordenar = function (a, b) {
      return parseISO(a.fim).getTime() - parseISO(b.fim).getTime();
    };
    futuros.sort(ordenar);
    // Se houver poucos marcos futuros, completa com os mais recentes passados.
    if (futuros.length >= limite) return futuros.slice(0, limite);
    passados.sort(ordenar);
    return passados.slice(-(limite - futuros.length)).concat(futuros);
  }

  // Mapa rápido id -> disciplina (nome/cor) do cronograma.
  function mapaDisciplinas(cronograma) {
    var mapa = {};
    (cronograma.disciplinas || []).forEach(function (d) {
      mapa[d.id] = d;
    });
    return mapa;
  }

  /* ============================================================
     Blocos de UI
     ============================================================ */

  // 1. Hero com contagem regressiva.
  function buildHero(hoje) {
    var hero = el("div", "vg-hero");

    var left = el("div");
    left.appendChild(el("h2", "vg-hero__title", EVENTO_NOME));
    var meta = el("p", "vg-hero__meta");
    meta.appendChild(document.createTextNode(EVENTO_DATA_LABEL));
    meta.appendChild(el("span", "vg-hero__sep", "·"));
    meta.appendChild(document.createTextNode(EVENTO_LOCAL));
    left.appendChild(meta);
    hero.appendChild(left);

    var inicio = parseISO(EVENTO_INICIO);
    var dias = inicio ? diffDias(hoje, inicio) : null;

    var cd = el("div", "vg-countdown");
    var num = el("span", "vg-countdown__num");
    var label = el("span", "vg-countdown__label");
    if (dias === null) {
      num.textContent = "—";
      label.textContent = "data do evento";
    } else if (dias > 0) {
      num.textContent = String(dias);
      label.textContent = dias === 1 ? "dia para o evento" : "dias para o evento";
    } else if (dias === 0) {
      num.textContent = "Hoje";
      label.textContent = "é o grande dia!";
    } else {
      num.textContent = String(Math.abs(dias));
      num.classList.add("is-passed");
      label.textContent = "dias desde o evento";
    }
    cd.appendChild(num);
    cd.appendChild(label);
    hero.appendChild(cd);

    return hero;
  }

  // Card KPI genérico (título + valor + dica/conteúdo extra opcional).
  function kpiCard(label, valor, opts) {
    opts = opts || {};
    var card = el("div", "card");
    card.appendChild(el("p", "vg-kpi__label", label));
    var v = el("div", "vg-kpi__value" + (opts.money ? " is-money" : ""), valor);
    card.appendChild(v);
    if (opts.hint) card.appendChild(el("div", "vg-kpi__hint", opts.hint));
    if (opts.extra) card.appendChild(opts.extra);
    return card;
  }

  // Linha de chips de status (concluído/andamento/pendente).
  function chipsStatus(c) {
    var box = el("div", "vg-kpi__chips");
    box.appendChild(badge("green", c.concluido + " concluídas"));
    box.appendChild(badge("blue", c.andamento + " em andamento"));
    box.appendChild(badge("muted", c.pendente + " pendentes"));
    return box;
  }

  function badge(cor, texto) {
    return el("span", "badge " + cor, texto);
  }

  // 2. Grade de KPIs.
  function buildKPIs(data, hoje) {
    var cron = data.cronograma || {};
    var fin = data.financeiro || {};
    var contr = (data.contratacoes && data.contratacoes.fornecedores) || [];
    var tarefas = cron.tarefas || [];

    var status = contarStatus(tarefas);
    var pct = pctConcluido(tarefas);
    var marcos = tarefas.filter(function (t) {
      return t.marco;
    });
    var marcosPendentes = marcos.filter(function (t) {
      return t.status !== "concluido";
    }).length;

    var receitaReal = soma(fin.receitas || [], "realizado");
    var despesaReal = soma(fin.despesas || [], "realizado");
    var saldo = receitaReal - despesaReal;

    var contagemContr = { fechado: 0, negociando: 0, a_contratar: 0 };
    contr.forEach(function (f) {
      if (contagemContr[f.status] !== undefined) contagemContr[f.status] += 1;
    });

    var grid = el("div", "grid cols-4");

    // KPI 1 — % concluído com barra
    grid.appendChild(
      kpiCard("Avanço geral", pct + "%", {
        extra: (function () {
          var box = el("div");
          box.style.marginTop = "12px";
          box.appendChild(barraProgresso(pct, "var(--green-bright)", true));
          return box;
        })(),
        hint: status.total + " tarefas no total"
      })
    );

    // KPI 2 — tarefas por status
    grid.appendChild(
      kpiCard("Tarefas", String(status.total), {
        extra: chipsStatus(status)
      })
    );

    // KPI 3 — marcos
    grid.appendChild(
      kpiCard("Marcos", String(marcos.length), {
        hint: marcosPendentes + " ainda por cumprir"
      })
    );

    // KPI 4 — saldo financeiro
    grid.appendChild(
      kpiCard("Saldo financeiro", Gestao.fmtBRL(saldo), {
        money: true,
        hint:
          "Receita " +
          Gestao.fmtBRL(receitaReal) +
          " − despesa " +
          Gestao.fmtBRL(despesaReal)
      })
    );

    // KPI 5 — contratos (ocupa linha cheia em telas largas via grid auto)
    var chipsContr = el("div", "vg-kpi__chips");
    chipsContr.appendChild(badge("green", contagemContr.fechado + " fechados"));
    chipsContr.appendChild(badge("orange", contagemContr.negociando + " negociando"));
    chipsContr.appendChild(badge("muted", contagemContr.a_contratar + " a contratar"));
    grid.appendChild(
      kpiCard("Contratações", String(contr.length), {
        extra: chipsContr
      })
    );

    return grid;
  }

  // 3. Avanço por disciplina.
  function buildAvanco(data) {
    var card = el("div", "card");
    var title = el("h3", "section-title", "Avanço por disciplina");
    var sub = el("span", "sub", "Ordenado por menor avanço (atenção primeiro)");
    title.appendChild(sub);
    card.appendChild(title);

    var lista = avancoPorDisciplina(data.cronograma || {});
    if (!lista.length) {
      card.appendChild(el("div", "empty", "Sem disciplinas com tarefas."));
      return card;
    }

    lista.forEach(function (d) {
      var bloco = el("div", "vg-disc");

      var head = el("div", "vg-disc__head");
      var name = el("div", "vg-disc__name");
      var dot = el("span", "vg-disc__dot");
      if (d.cor) dot.style.background = d.cor;
      name.appendChild(dot);
      name.appendChild(document.createTextNode(d.nome));
      name.appendChild(
        el("span", "vg-disc__count", "· " + d.concluidas + "/" + d.total)
      );
      head.appendChild(name);
      head.appendChild(el("span", "vg-disc__pct", d.pct + "%"));
      bloco.appendChild(head);

      bloco.appendChild(barraProgresso(d.pct, d.cor || "var(--purple)"));
      card.appendChild(bloco);
    });

    return card;
  }

  // 4. Próximos prazos.
  function buildPrazos(data, hoje) {
    var card = el("div", "card");
    card.appendChild(el("h3", "section-title", "Próximos prazos"));

    var prazos = proximosPrazos(data.cronograma || {}, MAX_PRAZOS);
    if (!prazos.length) {
      card.appendChild(el("div", "empty", "Nenhum prazo em aberto."));
      return card;
    }

    var mapa = mapaDisciplinas(data.cronograma || {});
    var box = el("div", "vg-prazos");

    prazos.forEach(function (t) {
      var fim = parseISO(t.fim);
      var late = estaAtrasada(t, hoje);
      var row = el("div", "vg-prazo" + (late ? " is-late" : ""));

      // Data (dia + mês)
      var date = el("div", "vg-prazo__date");
      date.appendChild(el("span", "vg-prazo__day", String(fim.getDate())));
      date.appendChild(el("span", "vg-prazo__mon", MESES_ABREV[fim.getMonth()]));
      row.appendChild(date);

      // Corpo (nome + disciplina/responsável)
      var body = el("div", "vg-prazo__body");
      body.appendChild(el("div", "vg-prazo__name", t.nome));

      var sub = el("div", "vg-prazo__sub");
      var disc = mapa[t.disciplinaId];
      if (disc) {
        var dot = el("span", "vg-disc__dot");
        if (disc.cor) dot.style.background = disc.cor;
        var discWrap = el("span");
        discWrap.style.display = "inline-flex";
        discWrap.style.alignItems = "center";
        discWrap.style.gap = "4px";
        discWrap.appendChild(dot);
        discWrap.appendChild(document.createTextNode(disc.nome));
        sub.appendChild(discWrap);
      }
      if (t.responsavel) sub.appendChild(el("span", null, t.responsavel));
      body.appendChild(sub);
      row.appendChild(body);

      // Etiqueta de atraso / data formatada
      if (late) {
        row.appendChild(badge("orange", "Atrasada"));
      } else if (t.status === "andamento") {
        row.appendChild(badge("blue", "Em andamento"));
      }

      box.appendChild(row);
    });

    card.appendChild(box);
    return card;
  }

  // 5. Timeline de marcos.
  function buildMarcos(data, hoje) {
    var card = el("div", "card");
    card.appendChild(el("h3", "section-title", "Marcos do projeto"));

    var marcos = proximosMarcos(data.cronograma || {}, hoje, MAX_MARCOS);
    if (!marcos.length) {
      card.appendChild(el("div", "empty", "Nenhum marco com data definida."));
      return card;
    }

    var mapa = mapaDisciplinas(data.cronograma || {});
    var ol = el("ul", "vg-marcos");

    marcos.forEach(function (t) {
      var fim = parseISO(t.fim);
      var li = el("li", "vg-marco");
      li.appendChild(el("span", "vg-marco__node"));

      var dataTxt = fim
        ? fim.getDate() + " " + MESES_ABREV[fim.getMonth()] + " " + fim.getFullYear()
        : "sem data";
      li.appendChild(el("div", "vg-marco__date", dataTxt));
      li.appendChild(el("div", "vg-marco__name", t.nome));

      var disc = mapa[t.disciplinaId];
      if (disc) li.appendChild(el("div", "vg-marco__sub", disc.nome));

      // Pinta o nó na cor da disciplina, se houver.
      if (disc && disc.cor) {
        li.querySelector(".vg-marco__node").style.background = disc.cor;
      }
      ol.appendChild(li);
    });

    card.appendChild(ol);
    return card;
  }

  // 6. Links rápidos para outras abas.
  function buildLinks() {
    var card = el("div", "card");
    card.appendChild(el("h3", "section-title", "Ir para"));

    var box = el("div", "vg-links");
    var destinos = [
      { id: "tab-cronograma", label: "Cronograma" },
      { id: "tab-financeiro", label: "Financeiro" },
      { id: "tab-contratacoes", label: "Contratações" },
      { id: "tab-disciplinas", label: "Disciplinas" }
    ];
    destinos.forEach(function (d) {
      var btn = el("button", "btn", d.label);
      btn.type = "button";
      btn.addEventListener("click", function () {
        if (Gestao.showTab) Gestao.showTab(d.id);
      });
      box.appendChild(btn);
    });

    card.appendChild(box);
    return card;
  }

  /* ============================================================
     Render principal
     ============================================================ */
  function render(mount, data) {
    ensureStyles();
    mount.innerHTML = ""; // limpa placeholder
    data = data || {};
    var hoje = hojeLocal();

    // Hero
    mount.appendChild(buildHero(hoje));

    // KPIs
    mount.appendChild(buildKPIs(data, hoje));

    // Espaço entre blocos
    var spacer = el("div");
    spacer.style.height = "20px";
    mount.appendChild(spacer);

    // Avanço + Prazos lado a lado (colapsam no mobile via .grid)
    var meio = el("div", "grid cols-2");
    meio.appendChild(buildAvanco(data));
    meio.appendChild(buildPrazos(data, hoje));
    mount.appendChild(meio);

    var spacer2 = el("div");
    spacer2.style.height = "20px";
    mount.appendChild(spacer2);

    // Marcos + Links
    var fim = el("div", "grid cols-2");
    fim.appendChild(buildMarcos(data, hoje));
    fim.appendChild(buildLinks());
    mount.appendChild(fim);
  }

  /* ============================================================
     Registro no app + exportação para teste
     ============================================================ */
  if (typeof window !== "undefined" && window.Gestao && window.Gestao.onTab) {
    window.Gestao.onTab("tab-visao", render);
  }

  // Exporta funções puras para teste em Node (sem afetar o browser).
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      parseISO: parseISO,
      diffDias: diffDias,
      estaAtrasada: estaAtrasada,
      contarStatus: contarStatus,
      pctConcluido: pctConcluido,
      soma: soma,
      avancoPorDisciplina: avancoPorDisciplina,
      proximosPrazos: proximosPrazos,
      proximosMarcos: proximosMarcos,
      clampPct: clampPct
    };
  }
})();
