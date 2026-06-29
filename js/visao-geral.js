/* ============================================================
   visao-geral.js — Módulo "Visão Geral" (dashboard gerencial)
   ------------------------------------------------------------
   Painel de leitura (sem CRUD) do PMIRS Summit 2026. Registra-se
   via Gestao.onTab('tab-visao', render). Visão do macro ao detalhe,
   com gráficos em SVG/CSS (sem bibliotecas, sem build).

   Seções:
   1. Cabeçalho padrão (Gestao.pageHeader) + contagem regressiva.
   2. Faixa de KPIs (6 cartões de destaque gerenciais).
   3. Gráficos lado a lado:
      a) Status das tarefas — rosca (donut) SVG.
      b) Avanço por GT — barras horizontais (risco primeiro).
      c) Financeiro — orçado × realizado (receita e despesa).
      d) Pipeline de contratações — colunas por status com valor.
   4. Próximos prazos (atrasos em destaque) + próximos marcos.
   5. Metas & KPIs (barras de progresso atual/alvo).
   6. Ações pendentes das reuniões (resumo + próximas por prazo).

   Segurança: todo valor vai por textContent / createElement;
   innerHTML nunca recebe dados (só markup estático, quando há).
   ============================================================ */

(function () {
  "use strict";

  /* ---- Constantes de domínio ---- */
  // Data-âncora para a contagem regressiva (1º dia do evento, local).
  var EVENTO_INICIO = "2026-11-13";
  var MAX_PRAZOS = 6;
  var MAX_MARCOS = 6;
  var MAX_ACOES = 5;
  var MS_DIA = 24 * 60 * 60 * 1000;
  var MESES_ABREV = [
    "jan", "fev", "mar", "abr", "mai", "jun",
    "jul", "ago", "set", "out", "nov", "dez"
  ];
  var SVG_NS = "http://www.w3.org/2000/svg";

  // Cores semânticas para o status das tarefas (paleta da marca).
  var COR_STATUS = {
    concluido: "var(--green-bright)",
    andamento: "var(--blue)",
    pendente: "var(--line)",
    atrasada: "var(--orange)"
  };

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

  // Data curta "13 nov" (sem ano) — usada nas listas compactas.
  function dataCurta(fim) {
    if (!fim) return "sem data";
    return fim.getDate() + " " + MESES_ABREV[fim.getMonth()];
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

  function svgEl(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        node.setAttribute(k, attrs[k]);
      });
    }
    return node;
  }

  function clampPct(n) {
    var v = Number(n);
    if (!isFinite(v)) return 0;
    return Math.max(0, Math.min(100, v));
  }

  // Barra de progresso reutilizável. pct é 0–100; cor é o fill.
  function barraProgresso(pct, cor, grande) {
    var wrap = el("div", "vg-bar" + (grande ? " is-lg" : ""));
    wrap.setAttribute("role", "progressbar");
    wrap.setAttribute("aria-valuenow", String(Math.round(clampPct(pct))));
    wrap.setAttribute("aria-valuemin", "0");
    wrap.setAttribute("aria-valuemax", "100");
    var fill = el("div", "vg-bar__fill");
    fill.style.width = clampPct(pct) + "%";
    if (cor) fill.style.background = cor;
    wrap.appendChild(fill);
    return wrap;
  }

  function badge(cor, texto) {
    return el("span", "badge " + cor, texto);
  }

  /* ============================================================
     Agregações sobre os dados
     ============================================================ */

  // Contagem de tarefas por status (+ atrasadas e urgentes).
  function contarStatus(tarefas, hoje) {
    var c = {
      concluido: 0,
      andamento: 0,
      pendente: 0,
      atrasada: 0,
      urgente: 0,
      total: tarefas.length
    };
    tarefas.forEach(function (t) {
      if (c[t.status] !== undefined) c[t.status] += 1;
      if (t.urgente) c.urgente += 1;
      if (hoje && estaAtrasada(t, hoje)) c.atrasada += 1;
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

  // Pipeline de contratações: contagem e valor somado por status.
  function pipelineContratacoes(contratacoes) {
    var base = {
      a_contratar: { qtd: 0, valor: 0 },
      negociando: { qtd: 0, valor: 0 },
      fechado: { qtd: 0, valor: 0 }
    };
    (contratacoes.fornecedores || []).forEach(function (f) {
      var s = base[f.status];
      if (!s) return;
      s.qtd += 1;
      var v = Number(f.valor);
      if (isFinite(v)) s.valor += v;
    });
    return base;
  }

  // Receita/despesa: total previsto e realizado de cada lado.
  function resumoFinanceiro(financeiro) {
    return {
      receitaPrev: soma(financeiro.receitas || [], "previsto"),
      receitaReal: soma(financeiro.receitas || [], "realizado"),
      despesaPrev: soma(financeiro.despesas || [], "previsto"),
      despesaReal: soma(financeiro.despesas || [], "realizado")
    };
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

  // Ações em aberto das reuniões (status !== concluido), por prazo.
  function acoesPendentes(reunioes) {
    var saida = [];
    (reunioes.reunioes || []).forEach(function (r) {
      (r.acoes || []).forEach(function (a) {
        if (a.status === "concluido") return;
        saida.push({
          texto: a.texto,
          responsavel: a.responsavel,
          prazo: a.prazo,
          reuniao: r.titulo
        });
      });
    });
    return saida.sort(function (a, b) {
      var pa = parseISO(a.prazo);
      var pb = parseISO(b.prazo);
      if (!pa && !pb) return 0;
      if (!pa) return 1;
      if (!pb) return -1;
      return pa.getTime() - pb.getTime();
    });
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
     Geometria do donut (gráfico de rosca em SVG)
     ============================================================ */

  // Calcula os arcos (start/end em fração 0–1) de cada fatia, na
  // ordem dada. Fatias com valor 0 são ignoradas.
  function arcosDonut(segmentos) {
    var total = segmentos.reduce(function (acc, s) {
      return acc + (s.valor > 0 ? s.valor : 0);
    }, 0);
    if (total <= 0) return [];
    var acumulado = 0;
    var out = [];
    segmentos.forEach(function (s) {
      if (s.valor <= 0) return;
      var ini = acumulado / total;
      acumulado += s.valor;
      var fim = acumulado / total;
      out.push({ label: s.label, cor: s.cor, ini: ini, fim: fim, valor: s.valor });
    });
    return out;
  }

  /* ============================================================
     Blocos de UI
     ============================================================ */

  // 1. Cabeçalho padrão (estilo Cronograma) com contagem regressiva.
  function buildHero(hoje) {
    var inicio = parseISO(EVENTO_INICIO);
    var dias = inicio ? diffDias(hoje, inicio) : null;

    var valor;
    var sub;
    if (dias === null) {
      valor = "—";
      sub = "data do evento";
    } else if (dias > 0) {
      valor = String(dias);
      sub = dias === 1 ? "dia p/ o evento" : "dias p/ o evento";
    } else if (dias === 0) {
      valor = "Hoje";
      sub = "é o grande dia!";
    } else {
      valor = "0";
      sub = "evento realizado";
    }

    var right = Gestao.headerStat({ value: valor, sub: sub, accent: true });

    return Gestao.pageHeader({
      eyebrow: "PAINEL GERAL · SUMMIT POA PMIRS 2026",
      title: "Visão geral do evento",
      subtitle: "13 e 14 de novembro · Tecnopuc · Porto Alegre",
      right: right
    });
  }

  // Card KPI: rótulo + valor grande + sub-contexto opcional.
  // opts = { sub, accent ('green'|'orange'), extra (DOM) }
  function kpiCard(label, valor, opts) {
    opts = opts || {};
    var card = el("div", "card vg-kpi");
    card.appendChild(el("p", "vg-kpi__label", label));
    var v = el("div", "vg-kpi__value", valor);
    if (opts.accent) v.classList.add("is-" + opts.accent);
    card.appendChild(v);
    if (opts.sub) card.appendChild(el("div", "vg-kpi__hint", opts.sub));
    if (opts.extra) card.appendChild(opts.extra);
    return card;
  }

  // 2. Faixa de KPIs (6 cartões gerenciais).
  function buildKPIs(data, hoje) {
    var cron = data.cronograma || {};
    var tarefas = cron.tarefas || [];
    var contr = data.contratacoes || {};
    var fin = resumoFinanceiro(data.financeiro || {});

    var status = contarStatus(tarefas, hoje);
    var pct = pctConcluido(tarefas);

    var marcos = tarefas.filter(function (t) {
      return t.marco;
    });
    var marcosFeitos = marcos.filter(function (t) {
      return t.status === "concluido";
    }).length;

    var saldo = fin.receitaReal - fin.despesaReal;

    var pipe = pipelineContratacoes(contr);

    var acoes = acoesPendentes(data.reunioes || {});

    var inicio = parseISO(EVENTO_INICIO);
    var dias = inicio ? Math.max(0, diffDias(hoje, inicio)) : null;

    var grid = el("div", "grid cols-3 vg-kpis");

    // KPI 1 — Avanço geral (% concluído) com barra.
    var barraWrap = el("div", "vg-kpi__bar");
    barraWrap.appendChild(barraProgresso(pct, "var(--green-bright)", true));
    grid.appendChild(
      kpiCard("Avanço geral", pct + "%", {
        sub: status.concluido + " de " + status.total + " tarefas concluídas",
        extra: barraWrap
      })
    );

    // KPI 2 — Marcos.
    grid.appendChild(
      kpiCard("Marcos", marcosFeitos + "/" + marcos.length, {
        sub:
          marcos.length - marcosFeitos === 0
            ? "todos cumpridos"
            : marcos.length - marcosFeitos + " ainda por cumprir"
      })
    );

    // KPI 3 — Saldo financeiro realizado.
    grid.appendChild(
      kpiCard("Saldo financeiro", Gestao.fmtBRL(saldo), {
        accent: saldo >= 0 ? "green" : "orange",
        sub:
          "Receita " +
          Gestao.fmtBRL(fin.receitaReal) +
          " · despesa " +
          Gestao.fmtBRL(fin.despesaReal)
      })
    );

    // KPI 4 — Contratos fechados (qtd + valor).
    grid.appendChild(
      kpiCard("Contratos fechados", String(pipe.fechado.qtd), {
        sub:
          pipe.fechado.valor > 0
            ? Gestao.fmtBRL(pipe.fechado.valor) + " contratados"
            : pipe.a_contratar.qtd + " ainda a contratar"
      })
    );

    // KPI 5 — Dias para o evento.
    grid.appendChild(
      kpiCard(
        "Dias para o evento",
        dias === null ? "—" : dias === 0 ? "Hoje" : String(dias),
        { sub: "13 nov 2026 · Tecnopuc" }
      )
    );

    // KPI 6 — Ações pendentes (de reuniões) + tarefas atrasadas.
    grid.appendChild(
      kpiCard("Ações pendentes", String(acoes.length), {
        accent: status.atrasada > 0 ? "orange" : undefined,
        sub:
          status.atrasada > 0
            ? status.atrasada + " tarefa(s) atrasada(s)"
            : "nenhuma tarefa atrasada"
      })
    );

    return grid;
  }

  /* ------------------------------------------------------------
     3a. Gráfico de rosca — status das tarefas
     ------------------------------------------------------------ */
  function buildGraficoStatus(data, hoje) {
    var card = el("div", "card vg-chart");
    card.appendChild(el("h3", "section-title", "Status das tarefas"));

    var tarefas = (data.cronograma || {}).tarefas || [];
    var c = contarStatus(tarefas, hoje);

    if (!c.total) {
      card.appendChild(el("div", "empty", "Sem tarefas cadastradas."));
      return card;
    }

    // Segmentos: concluído / andamento / pendente (não atrasada) / atrasada.
    var pendNaoAtrasada = Math.max(0, c.pendente + c.andamento - c.atrasada);
    // Reparte: mantemos andamento e pendente, e destacamos atrasadas à parte.
    var concl = c.concluido;
    var andam = c.andamento;
    var atrasada = c.atrasada;
    var pendente = Math.max(0, c.pendente - atrasada);
    // (atrasadas saem do bolo de andamento/pendente que estavam vencidas)
    // Garante consistência: atrasada não pode passar de (andamento+pendente).
    if (atrasada > andam + (c.pendente)) atrasada = andam + c.pendente;

    var segmentos = [
      { label: "Concluídas", valor: concl, cor: COR_STATUS.concluido },
      { label: "Em andamento", valor: andam, cor: COR_STATUS.andamento },
      { label: "Pendentes", valor: pendente, cor: COR_STATUS.pendente },
      { label: "Atrasadas", valor: atrasada, cor: COR_STATUS.atrasada }
    ];

    var arcos = arcosDonut(segmentos);

    var wrap = el("div", "vg-donut-wrap");

    // --- SVG do donut ---
    var size = 180;
    var cx = size / 2;
    var cy = size / 2;
    var r = 70;
    var stroke = 26;
    var circ = 2 * Math.PI * r;

    var svg = svgEl("svg", {
      class: "vg-donut",
      viewBox: "0 0 " + size + " " + size,
      width: size,
      height: size,
      role: "img",
      "aria-label":
        "Distribuição de " +
        c.total +
        " tarefas por status: " +
        concl +
        " concluídas, " +
        andam +
        " em andamento, " +
        pendente +
        " pendentes, " +
        atrasada +
        " atrasadas."
    });

    // Trilho de fundo.
    svg.appendChild(
      svgEl("circle", {
        cx: cx,
        cy: cy,
        r: r,
        fill: "none",
        stroke: "var(--line)",
        "stroke-width": stroke
      })
    );

    // Fatias (cada uma é um círculo com dash-offset).
    arcos.forEach(function (a) {
      var frac = a.fim - a.ini;
      var seg = svgEl("circle", {
        cx: cx,
        cy: cy,
        r: r,
        fill: "none",
        stroke: a.cor,
        "stroke-width": stroke,
        "stroke-dasharray": circ * frac + " " + circ * (1 - frac),
        // gira p/ o início do arco; -90° p/ começar no topo.
        "stroke-dashoffset": -circ * a.ini,
        transform: "rotate(-90 " + cx + " " + cy + ")"
      });
      var ttl = document.createElementNS(SVG_NS, "title");
      ttl.textContent = a.label + ": " + a.valor + " tarefas";
      seg.appendChild(ttl);
      svg.appendChild(seg);
    });

    // Centro: total + rótulo.
    var center = el("div", "vg-donut-center");
    center.appendChild(el("span", "vg-donut-num", String(c.total)));
    center.appendChild(el("span", "vg-donut-cap", "tarefas"));

    var donutBox = el("div", "vg-donut-box");
    donutBox.appendChild(svg);
    donutBox.appendChild(center);
    wrap.appendChild(donutBox);

    // Legenda.
    var legenda = el("div", "vg-legend");
    segmentos.forEach(function (s) {
      var item = el("div", "vg-legend__item");
      var dot = el("span", "vg-legend__dot");
      dot.style.background = s.cor;
      item.appendChild(dot);
      item.appendChild(el("span", "vg-legend__label", s.label));
      item.appendChild(el("span", "vg-legend__val", String(s.valor)));
      legenda.appendChild(item);
    });
    wrap.appendChild(legenda);

    card.appendChild(wrap);
    return card;
  }

  /* ------------------------------------------------------------
     3b. Avanço por GT — barras horizontais (risco primeiro)
     ------------------------------------------------------------ */
  function buildAvanco(data) {
    var card = el("div", "card vg-chart");
    var title = el("h3", "section-title", "Avanço por GT");
    title.appendChild(
      el("span", "sub", "Ordenado por menor avanço (atenção primeiro)")
    );
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

      var bp = barraProgresso(d.pct, d.cor || "var(--purple)");
      bp.setAttribute("title", d.nome + ": " + d.pct + "% concluído");
      bloco.appendChild(bp);
      card.appendChild(bloco);
    });

    return card;
  }

  /* ------------------------------------------------------------
     3c. Financeiro — orçado × realizado (receita e despesa)
     ------------------------------------------------------------ */
  // Uma linha de barra comparativa (previsto vs realizado).
  function barraComparativa(rotulo, previsto, realizado, corReal, maxVal) {
    var bloco = el("div", "vg-fin-row");
    var head = el("div", "vg-fin-row__head");
    head.appendChild(el("span", "vg-fin-row__label", rotulo));
    bloco.appendChild(head);

    function linha(legenda, valor, cls) {
      var row = el("div", "vg-fin-bar");
      var track = el("div", "vg-fin-bar__track");
      var fill = el("div", "vg-fin-bar__fill " + cls);
      var pct = maxVal > 0 ? (valor / maxVal) * 100 : 0;
      fill.style.width = clampPct(pct) + "%";
      fill.setAttribute("title", rotulo + " " + legenda.toLowerCase() + ": " + Gestao.fmtBRL(valor));
      track.appendChild(fill);
      row.appendChild(el("span", "vg-fin-bar__cap", legenda));
      row.appendChild(track);
      row.appendChild(el("span", "vg-fin-bar__val", Gestao.fmtBRL(valor)));
      return row;
    }

    bloco.appendChild(linha("Previsto", previsto, "is-prev"));
    bloco.appendChild(linha("Realizado", realizado, "is-real " + corReal));
    return bloco;
  }

  function buildFinanceiro(data) {
    var card = el("div", "card vg-chart");
    var title = el("h3", "section-title", "Financeiro — orçado × realizado");
    title.appendChild(el("span", "sub", "Receita e despesa do evento"));
    card.appendChild(title);

    var f = resumoFinanceiro(data.financeiro || {});
    var maxVal = Math.max(f.receitaPrev, f.receitaReal, f.despesaPrev, f.despesaReal);

    if (maxVal <= 0) {
      card.appendChild(
        el("div", "empty", "Sem valores financeiros lançados ainda.")
      );
      return card;
    }

    card.appendChild(
      barraComparativa("Receita", f.receitaPrev, f.receitaReal, "is-green", maxVal)
    );
    card.appendChild(
      barraComparativa("Despesa", f.despesaPrev, f.despesaReal, "is-orange", maxVal)
    );

    // Nota de leitura quando não há realizado (estado inicial dos dados).
    if (f.receitaReal === 0 && f.despesaReal === 0) {
      card.appendChild(
        el(
          "p",
          "vg-fin-note muted-text",
          "Ainda sem valores realizados — barras mostram apenas o previsto."
        )
      );
    }

    return card;
  }

  /* ------------------------------------------------------------
     3d. Pipeline de contratações — colunas por status
     ------------------------------------------------------------ */
  function buildPipeline(data) {
    var card = el("div", "card vg-chart");
    var title = el("h3", "section-title", "Pipeline de contratações");
    title.appendChild(el("span", "sub", "Itens por estágio e valor somado"));
    card.appendChild(title);

    var contr = data.contratacoes || {};
    var total = (contr.fornecedores || []).length;
    if (!total) {
      card.appendChild(el("div", "empty", "Nenhum item de contratação."));
      return card;
    }

    var pipe = pipelineContratacoes(contr);
    var colunas = [
      { key: "a_contratar", label: "A contratar", cls: "is-muted" },
      { key: "negociando", label: "Negociando", cls: "is-orange" },
      { key: "fechado", label: "Fechado", cls: "is-green" }
    ];
    var maxQtd = colunas.reduce(function (m, col) {
      return Math.max(m, pipe[col.key].qtd);
    }, 0);

    var box = el("div", "vg-pipe");
    colunas.forEach(function (col) {
      var dados = pipe[col.key];
      var coluna = el("div", "vg-pipe__col");

      // valor (acima da barra)
      coluna.appendChild(
        el(
          "span",
          "vg-pipe__valor",
          dados.valor > 0 ? Gestao.fmtBRL(dados.valor) : "—"
        )
      );

      // barra vertical proporcional à quantidade
      var bar = el("div", "vg-pipe__bar " + col.cls);
      var h = maxQtd > 0 ? (dados.qtd / maxQtd) * 100 : 0;
      // piso visual para colunas com 0 (fica baixinha mas visível)
      bar.style.height = (dados.qtd > 0 ? Math.max(8, h) : 2) + "%";
      bar.setAttribute("title", col.label + ": " + dados.qtd + " contratos");
      var barWrap = el("div", "vg-pipe__barwrap");
      barWrap.appendChild(bar);
      coluna.appendChild(barWrap);

      // quantidade (grande)
      coluna.appendChild(el("span", "vg-pipe__qtd", String(dados.qtd)));
      coluna.appendChild(el("span", "vg-pipe__label", col.label));
      box.appendChild(coluna);
    });

    card.appendChild(box);
    return card;
  }

  /* ------------------------------------------------------------
     4a. Próximos prazos
     ------------------------------------------------------------ */
  function buildPrazos(data, hoje) {
    var card = el("div", "card");
    var title = el("h3", "section-title", "Próximos prazos");
    title.appendChild(el("span", "sub", "Atrasados em destaque"));
    card.appendChild(title);

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
        var discWrap = el("span", "vg-prazo__disc");
        discWrap.appendChild(dot);
        discWrap.appendChild(document.createTextNode(disc.nome));
        sub.appendChild(discWrap);
      }
      if (t.responsavel) sub.appendChild(el("span", null, t.responsavel));
      body.appendChild(sub);
      row.appendChild(body);

      // Etiqueta de atraso / andamento
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

  /* ------------------------------------------------------------
     4b. Timeline de marcos
     ------------------------------------------------------------ */
  function buildMarcos(data, hoje) {
    var card = el("div", "card");
    var title = el("h3", "section-title", "Próximos marcos");
    title.appendChild(el("span", "sub", "Entregas críticas do projeto"));
    card.appendChild(title);

    var marcos = proximosMarcos(data.cronograma || {}, hoje, MAX_MARCOS);
    if (!marcos.length) {
      card.appendChild(el("div", "empty", "Nenhum marco com data definida."));
      return card;
    }

    var mapa = mapaDisciplinas(data.cronograma || {});
    var ol = el("ul", "vg-marcos");

    marcos.forEach(function (t) {
      var fim = parseISO(t.fim);
      var passado = fim && fim.getTime() < hoje.getTime();
      var li = el("li", "vg-marco" + (passado ? " is-done" : ""));
      var node = el("span", "vg-marco__node");
      li.appendChild(node);

      var dataTxt = fim
        ? fim.getDate() + " " + MESES_ABREV[fim.getMonth()] + " " + fim.getFullYear()
        : "sem data";
      li.appendChild(el("div", "vg-marco__date", dataTxt));
      li.appendChild(el("div", "vg-marco__name", t.nome));

      var disc = mapa[t.disciplinaId];
      if (disc) li.appendChild(el("div", "vg-marco__sub", disc.nome));

      // Pinta o nó na cor da disciplina, se houver.
      if (disc && disc.cor) node.style.background = disc.cor;
      ol.appendChild(li);
    });

    card.appendChild(ol);
    return card;
  }

  /* ------------------------------------------------------------
     5. Metas & KPIs — barras de progresso
     ------------------------------------------------------------ */
  function formatarValorMeta(valor, unidade) {
    if (unidade === "R$") return Gestao.fmtBRL(valor);
    var n = Number(valor);
    if (!isFinite(n)) n = 0;
    // inteiro quando possível, senão 1 casa
    var num = Number.isInteger(n) ? String(n) : n.toFixed(1);
    return unidade ? num + " " + unidade : num;
  }

  function buildMetas(data) {
    var card = el("div", "card");
    var title = el("h3", "section-title", "Metas & KPIs");
    title.appendChild(el("span", "sub", "Atual × alvo do evento"));
    card.appendChild(title);

    var metas = (data.metas || {}).metas || [];
    if (!metas.length) {
      card.appendChild(el("div", "empty", "Nenhuma meta definida."));
      return card;
    }

    var box = el("div", "vg-metas");
    metas.forEach(function (m) {
      var alvo = Number(m.alvo) || 0;
      var atual = Number(m.atual) || 0;
      var pct = alvo > 0 ? Math.round((atual / alvo) * 100) : 0;

      var bloco = el("div", "vg-meta");
      var head = el("div", "vg-meta__head");
      head.appendChild(el("span", "vg-meta__name", m.nome));
      head.appendChild(el("span", "vg-meta__pct", clampPct(pct) + "%"));
      bloco.appendChild(head);

      bloco.appendChild(barraProgresso(pct, "var(--purple-2)"));

      var foot = el("div", "vg-meta__foot");
      foot.appendChild(
        el(
          "span",
          null,
          formatarValorMeta(atual, m.unidade) +
            " de " +
            formatarValorMeta(alvo, m.unidade)
        )
      );
      bloco.appendChild(foot);
      box.appendChild(bloco);
    });

    card.appendChild(box);
    return card;
  }

  /* ------------------------------------------------------------
     6. Ações pendentes das reuniões
     ------------------------------------------------------------ */
  function buildAcoes(data, hoje) {
    var card = el("div", "card");
    var acoes = acoesPendentes(data.reunioes || {});

    var title = el("h3", "section-title", "Ações pendentes das reuniões");
    title.appendChild(
      el(
        "span",
        "sub",
        acoes.length === 0
          ? "tudo em dia"
          : acoes.length + " em aberto · próximas por prazo"
      )
    );
    card.appendChild(title);

    if (!acoes.length) {
      card.appendChild(el("div", "empty", "Nenhuma ação em aberto."));
      return card;
    }

    var box = el("div", "vg-acoes");
    acoes.slice(0, MAX_ACOES).forEach(function (a) {
      var fim = parseISO(a.prazo);
      var late = fim && fim.getTime() < hoje.getTime();
      var row = el("div", "vg-acao" + (late ? " is-late" : ""));

      var body = el("div", "vg-acao__body");
      body.appendChild(el("div", "vg-acao__text", a.texto));
      var sub = el("div", "vg-acao__sub");
      if (a.responsavel) sub.appendChild(el("span", null, a.responsavel));
      if (a.prazo) {
        sub.appendChild(el("span", null, "prazo " + Gestao.fmtData(a.prazo)));
      }
      body.appendChild(sub);
      row.appendChild(body);

      if (late) row.appendChild(badge("orange", "Vencida"));
      box.appendChild(row);
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

    var root = el("div", "vg-root");

    // 1. Cabeçalho + contagem regressiva.
    root.appendChild(buildHero(hoje));

    // 2. Faixa de KPIs.
    root.appendChild(buildKPIs(data, hoje));

    // 3. Gráficos (2 colunas; viram 1 no mobile).
    var graficos1 = el("div", "grid cols-2 vg-section");
    graficos1.appendChild(buildGraficoStatus(data, hoje));
    graficos1.appendChild(buildAvanco(data));
    root.appendChild(graficos1);

    var graficos2 = el("div", "grid cols-2 vg-section");
    graficos2.appendChild(buildFinanceiro(data));
    graficos2.appendChild(buildPipeline(data));
    root.appendChild(graficos2);

    // 4. Próximos prazos + marcos.
    var prazos = el("div", "grid cols-2 vg-section");
    prazos.appendChild(buildPrazos(data, hoje));
    prazos.appendChild(buildMarcos(data, hoje));
    root.appendChild(prazos);

    // 5 + 6. Metas + ações pendentes.
    var rodape = el("div", "grid cols-2 vg-section");
    rodape.appendChild(buildMetas(data));
    rodape.appendChild(buildAcoes(data, hoje));
    root.appendChild(rodape);

    mount.appendChild(root);
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
      pipelineContratacoes: pipelineContratacoes,
      resumoFinanceiro: resumoFinanceiro,
      proximosPrazos: proximosPrazos,
      proximosMarcos: proximosMarcos,
      acoesPendentes: acoesPendentes,
      arcosDonut: arcosDonut,
      clampPct: clampPct,
      formatarValorMeta: formatarValorMeta
    };
  }
})();
