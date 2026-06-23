/* ============================================================
   cronograma.js — Módulo Cronograma (Gantt/Timeline editável)
   ------------------------------------------------------------
   Núcleo do app: visão de cronograma profissional com
   - Gantt agrupado por disciplina (barras posicionadas por data)
   - Marcos como losangos
   - CRUD de tarefas (criar / editar / excluir) via modal
   - Criação de disciplinas embutida no formulário
   - Filtros por disciplina e status + busca por nome
   - Cards de resumo no topo
   - Persistência via Gestao.save() (localStorage)

   Contrato (NÃO alterado aqui): window.Gestao.
   Registra-se com Gestao.onTab('tab-cronograma', render).
   Após qualquer edição em Gestao.data.cronograma: save() + render.
   ============================================================ */

(function () {
  "use strict";

  /* ---- Constantes de domínio ---- */
  var STATUS_OPTIONS = [
    { id: "concluido", label: "Concluído" },
    { id: "andamento", label: "Em andamento" },
    { id: "pendente", label: "Pendente" }
  ];

  // Cor sugerida para disciplinas novas (paleta da marca).
  var DEFAULT_NEW_COLOR = "#36177B";

  // Meses curtos em pt-BR (1=jan).
  var MESES_CURTOS = [
    "jan", "fev", "mar", "abr", "mai", "jun",
    "jul", "ago", "set", "out", "nov", "dez"
  ];

  var MS_DIA = 24 * 60 * 60 * 1000;

  /* ---- Estado de UI (filtros/busca) — vive só no módulo ---- */
  var ui = {
    discFiltro: null, // Set de disciplinaIds ativas (null = todas)
    statusFiltro: null, // Set de status ativos (null = todos)
    busca: ""
  };

  /* ============================================================
     Utilidades de data (tratando 'AAAA-MM-DD' como LOCAL)
     ============================================================ */

  // Converte 'AAAA-MM-DD' para Date local (sem shift de fuso).
  function parseISO(iso) {
    if (!iso) return null;
    var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  // Date local -> 'AAAA-MM-DD'.
  function toISO(d) {
    var y = d.getFullYear();
    var mo = String(d.getMonth() + 1).padStart(2, "0");
    var da = String(d.getDate()).padStart(2, "0");
    return y + "-" + mo + "-" + da;
  }

  // Hoje, normalizado para meia-noite local.
  function hojeLocal() {
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }

  // Nº de dias inteiros entre duas datas (b - a).
  function diffDias(a, b) {
    return Math.round((b.getTime() - a.getTime()) / MS_DIA);
  }

  /* ============================================================
     Injeção do CSS do módulo (sem tocar no index.html)
     ============================================================ */
  function ensureCSS() {
    var href = "css/cronograma.css";
    var existing = document.querySelector('link[data-cro-css]');
    if (existing) return;
    // Evita duplicar caso já exista um link igual por outro caminho.
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < links.length; i++) {
      if ((links[i].getAttribute("href") || "").indexOf("cronograma.css") !== -1) {
        return;
      }
    }
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute("data-cro-css", "1");
    document.head.appendChild(link);
  }

  /* ============================================================
     Helpers de criação de DOM (seguros contra XSS)
     - Sempre textContent para dados do usuário.
     ============================================================ */
  function el(tag, opts) {
    var node = document.createElement(tag);
    if (!opts) return node;
    if (opts.cls) node.className = opts.cls;
    if (opts.text != null) node.textContent = String(opts.text);
    if (opts.attrs) {
      Object.keys(opts.attrs).forEach(function (k) {
        node.setAttribute(k, opts.attrs[k]);
      });
    }
    if (opts.style) node.setAttribute("style", opts.style);
    if (opts.on) {
      Object.keys(opts.on).forEach(function (evt) {
        node.addEventListener(evt, opts.on[evt]);
      });
    }
    if (opts.children) {
      opts.children.forEach(function (c) {
        if (c) node.appendChild(c);
      });
    }
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  /* ============================================================
     Acesso aos dados do cronograma (sempre normalizado)
     ============================================================ */
  function getCrono(data) {
    var c = data && data.cronograma;
    if (!c || typeof c !== "object") c = {};
    if (!Array.isArray(c.disciplinas)) c.disciplinas = [];
    if (!Array.isArray(c.tarefas)) c.tarefas = [];
    // Garante que o objeto exista para edições posteriores.
    data.cronograma = c;
    return c;
  }

  function discById(crono) {
    var map = {};
    crono.disciplinas.forEach(function (d) {
      map[d.id] = d;
    });
    return map;
  }

  // Cor da disciplina (fallback neutro se não encontrada).
  function corDisciplina(map, id) {
    var d = map[id];
    return (d && d.cor) || "#6B6480";
  }

  // Gera um id kebab-case único a partir do nome da disciplina.
  function slugify(nome) {
    return String(nome)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // remove acentos (diacríticos)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "disciplina";
  }

  function idDisciplinaUnico(crono, nome) {
    var base = slugify(nome);
    var id = base;
    var n = 2;
    var existe = {};
    crono.disciplinas.forEach(function (d) {
      existe[d.id] = true;
    });
    while (existe[id]) {
      id = base + "-" + n;
      n += 1;
    }
    return id;
  }

  /* ============================================================
     Cálculo do intervalo do Gantt (em meses, com folga)
     ============================================================ */
  function calcularIntervalo(tarefas) {
    var datas = [];
    tarefas.forEach(function (t) {
      var ini = parseISO(t.inicio);
      var fim = parseISO(t.fim);
      if (ini) datas.push(ini);
      if (fim) datas.push(fim);
    });

    var min, max;
    if (datas.length === 0) {
      // Sem datas: usa o ano corrente como moldura mínima.
      var h = hojeLocal();
      min = new Date(h.getFullYear(), h.getMonth(), 1);
      max = new Date(h.getFullYear(), h.getMonth() + 5, 1);
    } else {
      min = datas[0];
      max = datas[0];
      datas.forEach(function (d) {
        if (d < min) min = d;
        if (d > max) max = d;
      });
    }

    // Folga: começa no 1º dia do mês de min, termina no último dia
    // do mês de max (assim a barra final nunca encosta na borda).
    var start = new Date(min.getFullYear(), min.getMonth(), 1);
    var end = new Date(max.getFullYear(), max.getMonth() + 1, 0); // último dia do mês

    // Lista de meses (1º dia de cada) no intervalo.
    var meses = [];
    var cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= end) {
      meses.push(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }

    var totalDias = diffDias(start, end) + 1; // inclusivo
    return { start: start, end: end, meses: meses, totalDias: totalDias };
  }

  // Posição percentual (0-100) de uma data dentro do intervalo.
  function pctData(intervalo, d) {
    var off = diffDias(intervalo.start, d);
    return (off / intervalo.totalDias) * 100;
  }

  /* ============================================================
     Filtros + ordenação das tarefas
     ============================================================ */
  function passaFiltro(t) {
    if (ui.discFiltro && !ui.discFiltro.has(t.disciplinaId)) return false;
    if (ui.statusFiltro && !ui.statusFiltro.has(t.status)) return false;
    if (ui.busca) {
      var alvo = (String(t.nome || "") + " " + String(t.responsavel || "")).toLowerCase();
      if (alvo.indexOf(ui.busca) === -1) return false;
    }
    return true;
  }

  // Ordena por data de início (nulos por último), depois por id.
  function ordenarTarefas(lista) {
    return lista.slice().sort(function (a, b) {
      var ia = parseISO(a.inicio);
      var ib = parseISO(b.inicio);
      if (ia && ib) {
        if (ia.getTime() !== ib.getTime()) return ia - ib;
      } else if (ia && !ib) {
        return -1;
      } else if (!ia && ib) {
        return 1;
      }
      return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
    });
  }

  /* ============================================================
     CARDS DE RESUMO (topo)
     ============================================================ */
  function buildResumo(crono) {
    var tarefas = crono.tarefas;
    var total = tarefas.length;
    var concluidas = tarefas.filter(function (t) {
      return t.status === "concluido";
    }).length;
    var pctConcluido = total ? Math.round((concluidas / total) * 100) : 0;
    var marcos = tarefas.filter(function (t) {
      return t.marco === true;
    }).length;

    // Próximos 3 prazos: tarefas não concluídas com 'fim' no futuro
    // (ou hoje), ordenadas pela data de fim mais próxima.
    var hoje = hojeLocal();
    var proximos = tarefas
      .filter(function (t) {
        if (t.status === "concluido") return false;
        var f = parseISO(t.fim);
        return f && f >= hoje;
      })
      .sort(function (a, b) {
        return parseISO(a.fim) - parseISO(b.fim);
      })
      .slice(0, 3);

    var statCards = [
      cardStat("Tarefas", String(total), total === 1 ? "1 atividade" : total + " atividades"),
      cardStat("Concluído", pctConcluido + "%", concluidas + " de " + total),
      cardStat("Marcos", String(marcos), "pontos de controle")
    ];

    // Card de próximos prazos (lista).
    var proxChildren = [
      el("p", { cls: "cro-stat-label", text: "Próximos prazos" })
    ];
    if (proximos.length === 0) {
      proxChildren.push(el("p", { cls: "cro-next-empty", text: "Sem prazos futuros pendentes." }));
    } else {
      var ul = el("ul", { cls: "cro-next-list" });
      proximos.forEach(function (t) {
        ul.appendChild(
          el("li", {
            children: [
              el("span", { cls: "cro-next-name", text: t.nome, attrs: { title: t.nome } }),
              el("span", { cls: "cro-next-date", text: Gestao.fmtData(t.fim) })
            ]
          })
        );
      });
      proxChildren.push(ul);
    }
    var proxCard = el("div", { cls: "cro-stat", children: proxChildren });

    return el("section", {
      cls: "cro-summary",
      attrs: { "aria-label": "Resumo do cronograma" },
      children: statCards.concat([proxCard])
    });
  }

  function cardStat(label, value, sub) {
    return el("div", {
      cls: "cro-stat",
      children: [
        el("p", { cls: "cro-stat-label", text: label }),
        el("div", { cls: "cro-stat-value", text: value }),
        el("div", { cls: "cro-stat-sub", text: sub })
      ]
    });
  }

  /* ============================================================
     FILTROS (chips de disciplina + status + busca)
     ============================================================ */
  function buildFiltros(crono, onChange) {
    var wrap = el("section", { cls: "cro-filters", attrs: { "aria-label": "Filtros" } });

    // Linha de disciplinas
    var rowDisc = el("div", { cls: "cro-filter-row" });
    rowDisc.appendChild(el("span", { cls: "cro-filter-label", text: "Disciplinas" }));
    crono.disciplinas.forEach(function (d) {
      var ativo = !ui.discFiltro || ui.discFiltro.has(d.id);
      var dot = el("span", { cls: "cro-dot", style: "background:" + d.cor });
      var chip = el("button", {
        cls: "cro-chip",
        attrs: { type: "button", "aria-pressed": ativo ? "true" : "false" },
        children: [dot, el("span", { text: d.nome })],
        on: {
          click: function () {
            toggleSetFiltro("discFiltro", d.id, crono.disciplinas.map(function (x) { return x.id; }));
            onChange();
          }
        }
      });
      rowDisc.appendChild(chip);
    });
    wrap.appendChild(rowDisc);

    // Linha de status + busca
    var rowStatus = el("div", { cls: "cro-filter-row" });
    rowStatus.appendChild(el("span", { cls: "cro-filter-label", text: "Status" }));
    STATUS_OPTIONS.forEach(function (s) {
      var ativo = !ui.statusFiltro || ui.statusFiltro.has(s.id);
      var chip = el("button", {
        cls: "cro-chip",
        attrs: { type: "button", "aria-pressed": ativo ? "true" : "false" },
        text: s.label,
        on: {
          click: function () {
            toggleSetFiltro("statusFiltro", s.id, STATUS_OPTIONS.map(function (x) { return x.id; }));
            onChange();
          }
        }
      });
      rowStatus.appendChild(chip);
    });

    // Busca
    var busca = el("input", {
      cls: "cro-search",
      attrs: {
        type: "search",
        placeholder: "Buscar tarefa ou responsável…",
        "aria-label": "Buscar tarefa",
        value: ui.busca
      }
    });
    busca.addEventListener("input", function () {
      ui.busca = busca.value.trim().toLowerCase();
      // Atualiza só o Gantt para não perder o foco do input.
      onChange({ keepFocus: true });
    });
    rowStatus.appendChild(busca);

    wrap.appendChild(rowStatus);
    return wrap;
  }

  // Alterna um item num conjunto-filtro. Conjunto null = "todos ativos".
  // Clicar num item quando todos estão ativos isola... não: comportamento
  // intuitivo = liga/desliga itens individualmente.
  function toggleSetFiltro(chave, id, todosIds) {
    var atual = ui[chave];
    if (!atual) {
      // Estava "todos": cria um Set com todos e remove o clicado.
      atual = new Set(todosIds);
      atual.delete(id);
    } else if (atual.has(id)) {
      atual.delete(id);
    } else {
      atual.add(id);
    }
    // Se voltou a conter todos, normaliza para null ("todos").
    if (atual.size === todosIds.length) {
      ui[chave] = null;
    } else {
      ui[chave] = atual;
    }
  }

  /* ============================================================
     GANTT
     ============================================================ */
  function buildGantt(crono, intervalo, onEditar) {
    var map = discById(crono);

    var card = el("div", { cls: "card cro-gantt-card" });
    var scroll = el("div", { cls: "cro-gantt-scroll" });
    var gantt = el("div", { cls: "cro-gantt" });

    /* ---- Cabeçalho de meses ---- */
    var head = el("div", { cls: "cro-gantt-head" });
    head.appendChild(el("div", { cls: "cro-head-spacer", text: "Tarefa" }));
    var headMonths = el("div", { cls: "cro-head-months" });
    intervalo.meses.forEach(function (m) {
      var rotulo = MESES_CURTOS[m.getMonth()] + " " + String(m.getFullYear()).slice(2);
      headMonths.appendChild(el("div", { cls: "cro-head-month", text: rotulo }));
    });
    head.appendChild(headMonths);
    gantt.appendChild(head);

    /* ---- Corpo ---- */
    var body = el("div", { cls: "cro-gantt-body" });

    // Linhas de grade verticais (uma por início de mês) + linha hoje.
    var grid = el("div", { cls: "cro-gridlines" });
    intervalo.meses.forEach(function (m, i) {
      if (i === 0) return; // primeira borda é a do label
      var left = pctData(intervalo, m);
      grid.appendChild(el("div", { cls: "cro-gridline", style: "left:" + left + "%" }));
    });
    // Linha "hoje"
    var hoje = hojeLocal();
    if (hoje >= intervalo.start && hoje <= intervalo.end) {
      grid.appendChild(el("div", { cls: "cro-today", style: "left:" + pctData(intervalo, hoje) + "%" }));
    }
    body.appendChild(grid);

    // Agrupa tarefas (filtradas) por disciplina, na ordem das disciplinas.
    var visiveis = crono.tarefas.filter(function (t) {
      return temData(t) && passaFiltro(t);
    });

    var algumaLinha = false;
    crono.disciplinas.forEach(function (d) {
      var doGrupo = ordenarTarefas(
        visiveis.filter(function (t) {
          return t.disciplinaId === d.id;
        })
      );
      if (doGrupo.length === 0) return;
      algumaLinha = true;

      body.appendChild(grupoHead(d, doGrupo.length));
      doGrupo.forEach(function (t) {
        body.appendChild(linhaTarefa(t, d, intervalo, onEditar));
      });
    });

    // Tarefas com disciplina inexistente (órfãs) — agrupa no fim.
    var orfas = ordenarTarefas(
      visiveis.filter(function (t) {
        return !map[t.disciplinaId];
      })
    );
    if (orfas.length > 0) {
      algumaLinha = true;
      body.appendChild(
        grupoHead({ nome: "Sem disciplina", cor: "#6B6480" }, orfas.length)
      );
      orfas.forEach(function (t) {
        body.appendChild(linhaTarefa(t, { cor: "#6B6480" }, intervalo, onEditar));
      });
    }

    if (!algumaLinha) {
      body.appendChild(
        el("div", {
          cls: "empty",
          text: "Nenhuma tarefa com data corresponde aos filtros."
        })
      );
    }

    gantt.appendChild(body);
    scroll.appendChild(gantt);
    card.appendChild(scroll);
    card.appendChild(buildLegenda());
    return card;
  }

  function temData(t) {
    return !!(parseISO(t.inicio) || parseISO(t.fim));
  }

  function grupoHead(disc, count) {
    return el("div", {
      cls: "cro-group-head",
      children: [
        el("span", { cls: "cro-dot", style: "background:" + (disc.cor || "#6B6480") }),
        el("span", { text: disc.nome }),
        el("span", {
          cls: "cro-group-count",
          text: count + (count === 1 ? " tarefa" : " tarefas")
        })
      ]
    });
  }

  function linhaTarefa(t, disc, intervalo, onEditar) {
    var cor = disc.cor || "#6B6480";

    // Rótulo (nome + responsável)
    var labelChildren = [
      el("span", { cls: "cro-row-name", text: t.nome, attrs: { title: t.nome } })
    ];
    if (t.responsavel) {
      labelChildren.push(
        el("span", { cls: "cro-row-resp", text: t.responsavel, attrs: { title: t.responsavel } })
      );
    }
    var label = el("div", { cls: "cro-row-label", children: labelChildren });

    var track = el("div", { cls: "cro-track" });

    if (t.marco) {
      track.appendChild(marcoNode(t, cor, intervalo, onEditar));
    } else {
      track.appendChild(barraNode(t, cor, intervalo, onEditar));
    }

    return el("div", {
      cls: "cro-row",
      children: [label, track]
    });
  }

  // Barra de tarefa posicionada por início/fim.
  function barraNode(t, cor, intervalo, onEditar) {
    var ini = parseISO(t.inicio);
    var fim = parseISO(t.fim);
    // Se faltar uma das pontas, usa a outra como ponto (duração mínima).
    if (!ini && fim) ini = fim;
    if (ini && !fim) fim = ini;

    var left = pctData(intervalo, ini);
    // +1 dia para a barra cobrir o dia final inteiro.
    var right = pctData(intervalo, new Date(fim.getFullYear(), fim.getMonth(), fim.getDate() + 1));
    var width = Math.max(right - left, 0.6); // largura mínima visível

    var titulo = montarTitulo(t);

    var bar = el("button", {
      cls: "cro-bar is-" + (t.status || "pendente"),
      attrs: { type: "button", title: titulo, "aria-label": titulo },
      style: "left:" + left + "%;width:" + width + "%;background:" + cor,
      on: { click: function () { onEditar(t.id); } }
    });

    if (t.status === "concluido") {
      bar.appendChild(el("span", { cls: "cro-bar-check", text: "✓", attrs: { "aria-hidden": "true" } }));
    }
    // Nome curto dentro da barra (CSS corta com ellipsis se não couber).
    bar.appendChild(el("span", { cls: "cro-bar-text", text: t.nome }));
    return bar;
  }

  // Marco como losango posicionado pela data de fim (ou início).
  function marcoNode(t, cor, intervalo, onEditar) {
    var d = parseISO(t.fim) || parseISO(t.inicio);
    var left = pctData(intervalo, d);
    var titulo = montarTitulo(t);
    return el("button", {
      cls: "cro-milestone is-" + (t.status || "pendente"),
      attrs: { type: "button", title: titulo, "aria-label": "Marco: " + titulo },
      style: "left:" + left + "%;background:" + cor,
      on: { click: function () { onEditar(t.id); } }
    });
  }

  function montarTitulo(t) {
    var partes = [t.nome];
    if (t.responsavel) partes.push("· " + t.responsavel);
    var ini = Gestao.fmtData(t.inicio);
    var fim = Gestao.fmtData(t.fim);
    if (ini || fim) partes.push("(" + (ini || "?") + " – " + (fim || "?") + ")");
    partes.push("[" + statusLabel(t.status) + "]");
    if (t.marco) partes.push("⬥ marco");
    return partes.join(" ");
  }

  function statusLabel(id) {
    var s = STATUS_OPTIONS.filter(function (x) { return x.id === id; })[0];
    return s ? s.label : "Pendente";
  }

  function buildLegenda() {
    function item(cls, label, isMilestone) {
      var sample = el("span", { cls: "cro-sample" + (cls ? " " + cls : "") });
      if (isMilestone) sample.classList.add("is-milestone");
      return el("span", {
        cls: "cro-legend-item",
        children: [sample, el("span", { text: label })]
      });
    }
    return el("div", {
      cls: "cro-legend",
      attrs: { "aria-label": "Legenda" },
      children: [
        item("is-concluido", "Concluído"),
        item("is-andamento", "Em andamento"),
        item("is-pendente", "Pendente"),
        item("", "Marco", true)
      ]
    });
  }

  /* ============================================================
     SEÇÃO "SEM PRAZO DEFINIDO"
     ============================================================ */
  function buildSemPrazo(crono, onEditar) {
    var map = discById(crono);
    var semData = ordenarTarefas(
      crono.tarefas.filter(function (t) {
        return !temData(t) && passaFiltro(t);
      })
    );
    if (semData.length === 0) return null;

    var lista = el("div", { cls: "cro-noplan-list" });
    semData.forEach(function (t) {
      var cor = corDisciplina(map, t.disciplinaId);
      var children = [
        el("span", { cls: "cro-dot", style: "background:" + cor }),
        el("span", { cls: "cro-noplan-name", text: t.nome })
      ];
      var metaTxt = [];
      if (t.responsavel) metaTxt.push(t.responsavel);
      metaTxt.push(statusLabel(t.status));
      children.push(el("span", { cls: "cro-noplan-meta", text: metaTxt.join(" · ") }));

      lista.appendChild(
        el("button", {
          cls: "cro-noplan-item",
          attrs: { type: "button" },
          children: children,
          on: { click: function () { onEditar(t.id); } }
        })
      );
    });

    return el("section", {
      cls: "cro-noplan",
      children: [
        el("h3", { cls: "section-title", text: "Sem prazo definido" }),
        lista
      ]
    });
  }

  /* ============================================================
     MODAL — formulário de tarefa (criar / editar)
     ============================================================ */
  var modalAberto = null; // referência ao overlay aberto

  function abrirModal(crono, tarefa, onSalvo) {
    fecharModal();

    var editando = !!tarefa;
    var dados = tarefa || {
      nome: "",
      disciplinaId: crono.disciplinas[0] ? crono.disciplinas[0].id : "",
      responsavel: "",
      inicio: "",
      fim: "",
      status: "pendente",
      marco: false
    };

    // --- Campos ---
    var inpNome = inputText("nome-tarefa", dados.nome, "Ex.: Curadoria de palestrantes");

    // Select de disciplina + opção "Nova disciplina…"
    var selDisc = el("select", { attrs: { id: "sel-disc" } });
    crono.disciplinas.forEach(function (d) {
      var op = el("option", { text: d.nome, attrs: { value: d.id } });
      if (d.id === dados.disciplinaId) op.selected = true;
      selDisc.appendChild(op);
    });
    var opNova = el("option", { text: "+ Nova disciplina…", attrs: { value: "__nova__" } });
    selDisc.appendChild(opNova);

    // Bloco de criação de disciplina (oculto por padrão)
    var inpDiscNome = inputText("nova-disc-nome", "", "Nome da disciplina");
    var inpDiscCor = el("input", {
      attrs: { type: "color", value: DEFAULT_NEW_COLOR, id: "nova-disc-cor", "aria-label": "Cor da disciplina" }
    });
    var blocoNova = el("div", {
      cls: "cro-newdisc hidden",
      children: [
        field("Nome da nova disciplina", inpDiscNome),
        el("div", {
          cls: "cro-field",
          children: [
            el("label", { text: "Cor", attrs: { for: "nova-disc-cor" } }),
            el("div", { cls: "cro-color-row", children: [inpDiscCor] })
          ]
        })
      ]
    });
    selDisc.addEventListener("change", function () {
      blocoNova.classList.toggle("hidden", selDisc.value !== "__nova__");
    });

    var inpResp = inputText("resp-tarefa", dados.responsavel || "", "Ex.: Maria · João");
    var inpIni = inputDate("ini-tarefa", isoCurto(dados.inicio));
    var inpFim = inputDate("fim-tarefa", isoCurto(dados.fim));

    var selStatus = el("select", { attrs: { id: "sel-status" } });
    STATUS_OPTIONS.forEach(function (s) {
      var op = el("option", { text: s.label, attrs: { value: s.id } });
      if (s.id === dados.status) op.selected = true;
      selStatus.appendChild(op);
    });

    var chkMarco = el("input", { attrs: { type: "checkbox", id: "chk-marco" } });
    chkMarco.checked = !!dados.marco;

    var erro = el("div", { cls: "cro-form-error hidden", attrs: { role: "alert" } });

    // --- Botões ---
    var btnCancelar = el("button", {
      cls: "btn", text: "Cancelar", attrs: { type: "button" },
      on: { click: fecharModal }
    });
    var btnSalvar = el("button", {
      cls: "btn btn-primary", text: editando ? "Salvar alterações" : "Criar tarefa",
      attrs: { type: "submit" }
    });

    var direita = el("div", { cls: "cro-right", children: [btnCancelar, btnSalvar] });

    var acoesChildren = [];
    if (editando) {
      var btnExcluir = el("button", {
        cls: "btn btn-danger", text: "Excluir", attrs: { type: "button" },
        on: {
          click: function () {
            if (window.confirm('Excluir a tarefa "' + dados.nome + '"? Esta ação não pode ser desfeita.')) {
              excluirTarefa(crono, dados.id);
              fecharModal();
              onSalvo();
            }
          }
        }
      });
      acoesChildren.push(btnExcluir);
    }
    acoesChildren.push(direita);
    var acoes = el("div", { cls: "cro-modal-actions", children: acoesChildren });

    // --- Form ---
    var form = el("form", {
      attrs: { novalidate: "novalidate" },
      children: [
        field("Nome da tarefa", inpNome),
        field("Disciplina", selDisc),
        blocoNova,
        field("Responsável", inpResp),
        el("div", {
          cls: "cro-field-row",
          children: [field("Início", inpIni), field("Fim", inpFim)]
        }),
        field("Status", selStatus),
        el("div", {
          cls: "cro-check",
          children: [chkMarco, el("label", { text: "É um marco (milestone)", attrs: { for: "chk-marco" } })]
        }),
        erro,
        acoes
      ]
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var res = coletarESalvar({
        crono: crono,
        tarefa: tarefa,
        inpNome: inpNome,
        selDisc: selDisc,
        inpDiscNome: inpDiscNome,
        inpDiscCor: inpDiscCor,
        inpResp: inpResp,
        inpIni: inpIni,
        inpFim: inpFim,
        selStatus: selStatus,
        chkMarco: chkMarco
      });
      if (res.ok) {
        fecharModal();
        onSalvo();
      } else {
        erro.textContent = res.erro;
        erro.classList.remove("hidden");
      }
    });

    var modal = el("div", {
      cls: "cro-modal",
      attrs: { role: "dialog", "aria-modal": "true", "aria-label": editando ? "Editar tarefa" : "Nova tarefa" },
      children: [
        el("h3", { text: editando ? "Editar tarefa" : "Nova tarefa" }),
        form
      ]
    });

    var overlay = el("div", {
      cls: "cro-modal-overlay",
      on: {
        click: function (e) {
          if (e.target === overlay) fecharModal();
        }
      },
      children: [modal]
    });

    // Fecha com ESC.
    overlay._escHandler = function (e) {
      if (e.key === "Escape") fecharModal();
    };
    document.addEventListener("keydown", overlay._escHandler);

    document.body.appendChild(overlay);
    modalAberto = overlay;
    inpNome.focus();
  }

  function fecharModal() {
    if (!modalAberto) return;
    if (modalAberto._escHandler) {
      document.removeEventListener("keydown", modalAberto._escHandler);
    }
    if (modalAberto.parentNode) modalAberto.parentNode.removeChild(modalAberto);
    modalAberto = null;
  }

  // Lê o formulário, valida, aplica em Gestao.data, salva.
  function coletarESalvar(f) {
    var nome = f.inpNome.value.trim();
    if (!nome) return { ok: false, erro: "Informe o nome da tarefa." };

    // Resolve disciplina (existente ou nova).
    var disciplinaId = f.selDisc.value;
    if (disciplinaId === "__nova__") {
      var nomeDisc = f.inpDiscNome.value.trim();
      if (!nomeDisc) return { ok: false, erro: "Informe o nome da nova disciplina." };
      var novoId = idDisciplinaUnico(f.crono, nomeDisc);
      f.crono.disciplinas.push({ id: novoId, nome: nomeDisc, cor: f.inpDiscCor.value || DEFAULT_NEW_COLOR });
      disciplinaId = novoId;
    }
    if (!disciplinaId) return { ok: false, erro: "Selecione ou crie uma disciplina." };

    var ini = f.inpIni.value || null; // já é 'AAAA-MM-DD' do input date
    var fim = f.inpFim.value || null;

    // Validação: fim não pode ser anterior ao início.
    if (ini && fim && fim < ini) {
      return { ok: false, erro: "A data de fim não pode ser anterior à de início." };
    }

    var status = f.selStatus.value;
    var marco = f.chkMarco.checked;
    var progresso = status === "concluido" ? 100 : 0;

    if (f.tarefa) {
      // Edição: atualiza o objeto existente in-place (padrão do app).
      var t = f.tarefa;
      t.nome = nome;
      t.disciplinaId = disciplinaId;
      t.responsavel = f.inpResp.value.trim() || null;
      t.inicio = ini;
      t.fim = fim;
      t.status = status;
      t.marco = marco;
      t.progresso = progresso;
    } else {
      // Criação: novo objeto com id único.
      f.crono.tarefas.push({
        id: Gestao.uid("t"),
        codigo: null, // sem código EAP na criação manual
        disciplinaId: disciplinaId,
        nome: nome,
        inicio: ini,
        fim: fim,
        status: status,
        responsavel: f.inpResp.value.trim() || null,
        marco: marco,
        progresso: progresso
      });
    }

    Gestao.save();
    return { ok: true };
  }

  function excluirTarefa(crono, id) {
    var idx = -1;
    for (var i = 0; i < crono.tarefas.length; i++) {
      if (crono.tarefas[i].id === id) { idx = i; break; }
    }
    if (idx !== -1) {
      crono.tarefas.splice(idx, 1);
      Gestao.save();
    }
  }

  /* ---- Helpers de formulário ---- */
  function inputText(id, value, placeholder) {
    return el("input", {
      attrs: { type: "text", id: id, value: value || "", placeholder: placeholder || "" }
    });
  }

  function inputDate(id, value) {
    return el("input", { attrs: { type: "date", id: id, value: value || "" } });
  }

  function field(label, control) {
    var id = control.getAttribute && control.getAttribute("id");
    return el("div", {
      cls: "cro-field",
      children: [
        el("label", { text: label, attrs: id ? { for: id } : {} }),
        control
      ]
    });
  }

  // Garante 'AAAA-MM-DD' para o input date (corta ISO completo se houver).
  function isoCurto(iso) {
    if (!iso) return "";
    var m = String(iso).match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : "";
  }

  /* ============================================================
     RENDER PRINCIPAL
     ============================================================ */
  function render(mount, data) {
    ensureCSS();
    var crono = getCrono(data);

    clear(mount);

    // Re-render completo (usado após edições/filtros estruturais).
    function rerender() {
      render(mount, data);
    }

    // Abre o modal para editar uma tarefa por id.
    function editarPorId(id) {
      var t = crono.tarefas.filter(function (x) { return x.id === id; })[0];
      if (t) abrirModal(crono, t, rerender);
    }

    // --- Toolbar (título + botão nova tarefa) ---
    var btnNova = el("button", {
      cls: "btn btn-primary",
      attrs: { type: "button" },
      children: [
        el("span", { text: "+", attrs: { "aria-hidden": "true" } }),
        el("span", { text: " Nova tarefa" })
      ],
      on: { click: function () { abrirModal(crono, null, rerender); } }
    });

    var toolbar = el("div", {
      cls: "cro-toolbar",
      children: [
        el("div", {
          children: [
            el("h2", { cls: "section-title", text: "Cronograma" }),
            el("p", { cls: "muted-text", style: "margin:0;font-size:.88rem", text: "Linha do tempo das atividades, agrupadas por disciplina." })
          ]
        }),
        el("div", { cls: "cro-actions", children: [btnNova] })
      ]
    });
    mount.appendChild(toolbar);

    // --- Resumo ---
    mount.appendChild(buildResumo(crono));

    // --- Filtros ---
    // onChange: re-render completo (atualiza resumo/filtros também).
    // Para a busca, queremos manter o foco: re-render apenas do Gantt.
    var filtros = buildFiltros(crono, function (opts) {
      if (opts && opts.keepFocus) {
        atualizarSomenteGantt(mount, crono, editarPorId);
      } else {
        rerender();
      }
    });
    mount.appendChild(filtros);

    // --- Gantt ---
    var intervalo = calcularIntervalo(crono.tarefas);
    var gantt = buildGantt(crono, intervalo, editarPorId);
    gantt.setAttribute("data-cro-gantt-root", "1");
    mount.appendChild(gantt);

    // --- Sem prazo definido ---
    var semPrazo = buildSemPrazo(crono, editarPorId);
    if (semPrazo) mount.appendChild(semPrazo);
  }

  // Atualiza apenas o bloco do Gantt + a seção "sem prazo", preservando
  // o restante (e o foco do campo de busca).
  function atualizarSomenteGantt(mount, crono, editarPorId) {
    var antigo = mount.querySelector('[data-cro-gantt-root]');
    if (!antigo) return;
    var intervalo = calcularIntervalo(crono.tarefas);
    var novo = buildGantt(crono, intervalo, editarPorId);
    novo.setAttribute("data-cro-gantt-root", "1");
    antigo.parentNode.replaceChild(novo, antigo);

    // Atualiza/insere a seção "sem prazo".
    var antigaSP = mount.querySelector(".cro-noplan");
    var novaSP = buildSemPrazo(crono, editarPorId);
    if (antigaSP && novaSP) {
      antigaSP.parentNode.replaceChild(novaSP, antigaSP);
    } else if (antigaSP && !novaSP) {
      antigaSP.parentNode.removeChild(antigaSP);
    } else if (!antigaSP && novaSP) {
      mount.appendChild(novaSP);
    }
  }

  /* ============================================================
     Registro no app
     ============================================================ */
  if (window.Gestao && typeof Gestao.onTab === "function") {
    Gestao.onTab("tab-cronograma", render);
  } else {
    // app.js ainda não carregou: tenta novamente quando o DOM estiver pronto.
    document.addEventListener("DOMContentLoaded", function () {
      if (window.Gestao && typeof Gestao.onTab === "function") {
        Gestao.onTab("tab-cronograma", render);
      }
    });
  }
})();
