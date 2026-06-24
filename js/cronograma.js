/* ============================================================
   cronograma.js — Módulo Cronograma (Gantt profissional, fiel ao design)
   ------------------------------------------------------------
   Reproduz o Gantt do design de referência (Summit POA PMIRS 2026):
   - HEADER com logo, título serifado, contagem regressiva p/ o evento
   - LEGENDA de status (urgente / pendente / futuro / concluído / marco / hoje)
   - MARCOS CRÍTICOS em grade por mês (Jun..Nov)
   - GANTT em tabela agrupada por GT, com eixo fixo de 6 meses,
     barras posicionadas por início/fim, marcos como losangos roxos,
     linhas de grade por mês, faixa do evento e linha "HOJE"
   - CRUD completo (criar / editar / excluir tarefas e prazos) via modal
   - Filtros por GT e status + busca; persistência via Gestao.save()

   Contrato (NÃO alterado): window.Gestao. Vocabulário de status
   preservado (concluido / andamento / pendente). Campos novos
   (urgente, obs) são aditivos e não quebram outros módulos.

   Posicionamento temporal (igual ao design): meses Jun..Nov (0..5),
   dias por mês [30,31,31,30,31,30].
   fração f(m,d) = ((m + (d-1)/dim[m]) / 6) * 100  (% no eixo)
   ============================================================ */

(function () {
  "use strict";

  /* ============================================================
     Constantes de domínio e do eixo temporal
     ============================================================ */
  var STATUS_OPTIONS = [
    { id: "concluido", label: "Concluído" },
    { id: "andamento", label: "Em andamento" },
    { id: "pendente", label: "Pendente" }
  ];

  var DEFAULT_NEW_COLOR = "#36177B";

  // Eixo fixo do design: Junho..Novembro de 2026.
  var EIXO_ANO = 2026;
  var EIXO_MES_INI = 6; // junho (1-based)
  var EIXO_MESES = ["JUN", "JUL", "AGO", "SET", "OUT", "NOV"];
  var MESES_LONGOS = ["Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro"];
  // Dias por mês no eixo (jun..nov) — conforme o design.
  var DIM = [30, 31, 31, 30, 31, 30];
  var N_MESES = 6;

  // Data do evento (para contagem regressiva): 13/11/2026.
  var EVENTO_INI = { mes: 11, dia: 13 };
  var EVENTO_FIM = { mes: 11, dia: 14 };

  var LARGURA_MIN_PCT = 1.1; // largura mínima de barra (%)

  // Cores de status das barras (design).
  var COR = {
    concluido: { bg: "#3F7A4A", fg: "#FFFFFF", border: "#3F7A4A" },
    pendente: { bg: "#E0611F", fg: "#FFFFFF", border: "#E0611F" },
    futuro: { bg: "#E7E0D2", fg: "#6F6149", border: "#D4C8AF" },
    urgente: { bg: "#B83713", fg: "#FFFFFF", border: "#B83713" },
    marco: "#36177B"
  };

  /* ---- Estado de UI (filtros/busca) — vive só no módulo ---- */
  var ui = {
    discFiltro: null, // Set de disciplinaIds (null = todas)
    statusFiltro: null, // Set de chaves visuais (null = todas)
    busca: ""
  };

  // Chaves visuais usadas como filtro de status (derivadas, não o status cru).
  var VIS_OPTIONS = [
    { id: "urgente", label: "Urgente" },
    { id: "pendente", label: "Pendente" },
    { id: "futuro", label: "Futuro" },
    { id: "concluido", label: "Concluído" }
  ];

  /* ============================================================
     Utilidades de data (tratando 'AAAA-MM-DD' como LOCAL)
     ============================================================ */
  function parseISO(iso) {
    if (!iso) return null;
    var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  function hojeLocal() {
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }

  function isoCurto(iso) {
    if (!iso) return "";
    var m = String(iso).match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : "";
  }

  // Data de hoje por extenso, p/ "Atualizado em".
  function hojeExtenso() {
    var h = hojeLocal();
    var dia = String(h.getDate()).padStart(2, "0");
    var idx = h.getMonth() + 1 - EIXO_MES_INI;
    var nomeMes;
    if (idx >= 0 && idx < MESES_LONGOS.length) {
      nomeMes = MESES_LONGOS[idx].toLowerCase();
    } else {
      var todos = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
        "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
      nomeMes = todos[h.getMonth()];
    }
    return dia + " de " + nomeMes + " de " + h.getFullYear();
  }

  // Dias inteiros entre hoje e a data do evento (13/11/2026).
  function diasParaEvento() {
    var h = hojeLocal();
    var alvo = new Date(EIXO_ANO, EVENTO_INI.mes - 1, EVENTO_INI.dia);
    return Math.round((alvo.getTime() - h.getTime()) / (24 * 60 * 60 * 1000));
  }

  /* ============================================================
     Posicionamento no eixo fixo (Jun..Nov) — fórmula do design
     ============================================================ */

  // Fração 0..100 para (mês 1-based, dia 1-based).
  function fracaoMesDia(mes1, dia1) {
    var m = mes1 - EIXO_MES_INI; // 0..5
    if (m < 0) { m = 0; dia1 = 1; }
    if (m > N_MESES - 1) { m = N_MESES - 1; dia1 = DIM[m]; }
    var dim = DIM[m] || 30;
    var d = dia1 || 1;
    if (d < 1) d = 1;
    if (d > dim) d = dim;
    var f = ((m + (d - 1) / dim) / N_MESES) * 100;
    if (f < 0) f = 0;
    if (f > 100) f = 100;
    return f;
  }

  // Fração para um Date (clampa ao eixo).
  function fracaoData(d) {
    if (!d) return null;
    return fracaoMesDia(d.getMonth() + 1, d.getDate());
  }

  // Fração de início de uma tarefa: usa 'inicio' (1º dia do mês no design).
  function fracaoInicio(t) {
    var ini = parseISO(t.inicio);
    if (ini) return fracaoData(ini);
    var fim = parseISO(t.fim);
    if (fim) return fracaoData(fim);
    return null;
  }

  // Fração de fim: usa 'fim'; se nulo (Contínuo), vai até o fim do eixo.
  function fracaoFim(t) {
    var fim = parseISO(t.fim);
    if (fim) return fracaoData(fim);
    var ini = parseISO(t.inicio);
    if (ini) return 100; // sem fim definido = barra até o fim do período
    return null;
  }

  /* ============================================================
     Derivação visual do status (regra do design)
     concluido -> verde
     senão urgente -> vermelho
     senão início no futuro (> hoje) -> creme (futuro)
     senão -> laranja (pendente)
     ============================================================ */
  function classeVisual(t) {
    if (t.status === "concluido") return "concluido";
    if (t.urgente) return "urgente";
    var ini = parseISO(t.inicio);
    if (ini && ini > hojeLocal()) return "futuro";
    return "pendente";
  }

  function visualLabel(id) {
    var o = VIS_OPTIONS.filter(function (x) { return x.id === id; })[0];
    return o ? o.label : "Pendente";
  }

  /* ============================================================
     Injeção de fonte (Google Fonts) + CSS do módulo
     ============================================================ */
  function ensureHead() {
    // Fontes Fraunces + Manrope.
    if (!document.querySelector('link[data-cro-fonts]')) {
      var pre1 = document.createElement("link");
      pre1.rel = "preconnect";
      pre1.href = "https://fonts.googleapis.com";
      pre1.setAttribute("data-cro-fonts", "1");
      document.head.appendChild(pre1);

      var pre2 = document.createElement("link");
      pre2.rel = "preconnect";
      pre2.href = "https://fonts.gstatic.com";
      pre2.crossOrigin = "anonymous";
      pre2.setAttribute("data-cro-fonts", "1");
      document.head.appendChild(pre2);

      var f = document.createElement("link");
      f.rel = "stylesheet";
      f.setAttribute("data-cro-fonts", "1");
      f.href =
        "https://fonts.googleapis.com/css2?" +
        "family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400&" +
        "family=Manrope:wght@400;500;600;700;800&display=swap";
      document.head.appendChild(f);
    }

    // CSS do módulo (link único).
    var jaTem = false;
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < links.length; i++) {
      if ((links[i].getAttribute("href") || "").indexOf("cronograma.css") !== -1) {
        jaTem = true;
        break;
      }
    }
    if (!jaTem) {
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "css/cronograma.css";
      link.setAttribute("data-cro-css", "1");
      document.head.appendChild(link);
    }
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
     Acesso/normalização dos dados do cronograma
     ============================================================ */
  function getCrono(data) {
    var c = data && data.cronograma;
    if (!c || typeof c !== "object") c = {};
    if (!Array.isArray(c.disciplinas)) c.disciplinas = [];
    if (!Array.isArray(c.tarefas)) c.tarefas = [];
    data.cronograma = c;
    return c;
  }

  function discById(crono) {
    var map = {};
    crono.disciplinas.forEach(function (d) { map[d.id] = d; });
    return map;
  }

  function corDisciplina(map, id) {
    var d = map[id];
    return (d && d.cor) || "#6F6149";
  }

  function slugify(nome) {
    return (
      String(nome)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "") // remove diacríticos
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "disciplina"
    );
  }

  function idDisciplinaUnico(crono, nome) {
    var base = slugify(nome);
    var id = base;
    var n = 2;
    var existe = {};
    crono.disciplinas.forEach(function (d) { existe[d.id] = true; });
    while (existe[id]) {
      id = base + "-" + n;
      n += 1;
    }
    return id;
  }

  /* ============================================================
     Filtros + ordenação
     ============================================================ */
  function passaFiltro(t) {
    if (ui.discFiltro && !ui.discFiltro.has(t.disciplinaId)) return false;
    if (ui.statusFiltro && !ui.statusFiltro.has(classeVisual(t))) return false;
    if (ui.busca) {
      var alvo = (
        String(t.nome || "") + " " +
        String(t.responsavel || "") + " " +
        String(t.obs || "")
      ).toLowerCase();
      if (alvo.indexOf(ui.busca) === -1) return false;
    }
    return true;
  }

  // Ordena por código (numérico) quando houver; senão por início; senão id.
  function ordenarTarefas(lista) {
    return lista.slice().sort(function (a, b) {
      var ca = a.codigo, cb = b.codigo;
      if (ca && cb) {
        var cmp = ca.localeCompare(cb, undefined, { numeric: true });
        if (cmp !== 0) return cmp;
      } else if (ca && !cb) {
        return -1;
      } else if (!ca && cb) {
        return 1;
      }
      var ia = parseISO(a.inicio);
      var ib = parseISO(b.inicio);
      if (ia && ib && ia.getTime() !== ib.getTime()) return ia - ib;
      return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
    });
  }

  function toggleSetFiltro(chave, id, todosIds) {
    var atual = ui[chave];
    if (!atual) {
      // Tudo visível: o clique FOCA somente no item clicado.
      atual = new Set([id]);
    } else if (atual.has(id)) {
      if (atual.size === 1) {
        // Era o único em foco: clicar de novo volta a mostrar todos.
        atual = null;
      } else {
        atual = new Set(atual);
        atual.delete(id);
      }
    } else {
      // Adiciona o item ao foco atual.
      atual = new Set(atual);
      atual.add(id);
    }
    // Se todos acabaram selecionados, equivale a "todas" (sem filtro).
    if (atual && atual.size === todosIds.length) atual = null;
    ui[chave] = atual;
  }

  /* ============================================================
     1. HEADER (logo + título + contagem regressiva)
     ============================================================ */
  function buildHeader(crono) {
    // --- Esquerda: logo + divisória + bloco de título ---
    var logo = el("img", {
      cls: "cro-hdr-logo",
      attrs: {
        src: "assets/pmirs-horizontal-color.png",
        alt: "PMI Rio Grande do Sul Chapter"
      }
    });
    var divisor = el("span", { cls: "cro-hdr-divider", attrs: { "aria-hidden": "true" } });

    var eyebrow = el("p", {
      cls: "cro-hdr-eyebrow",
      text: "Cronograma do projeto · Summit POA PMIRS 2026"
    });
    var titulo = el("h2", { cls: "cro-hdr-title", text: "Plano macro de execução por GT" });
    var sub = el("p", {
      cls: "cro-hdr-sub",
      text: "“O futuro é artificial. A liderança é emocional.” · 13 e 14 de novembro · TECNOPUC · Porto Alegre"
    });
    var tituloBloco = el("div", {
      cls: "cro-hdr-titlewrap",
      children: [eyebrow, titulo, sub]
    });

    var esquerda = el("div", {
      cls: "cro-hdr-left",
      children: [logo, divisor, tituloBloco]
    });

    // --- Direita: atualizado em + métricas + cartão de contagem ---
    var nMarcos = crono.tarefas.filter(function (t) { return t.marco; }).length;
    var nGTs = crono.disciplinas.filter(function (d) { return d.id !== "evento"; }).length;
    var nEntregas = crono.tarefas.length;

    var meta = el("div", {
      cls: "cro-hdr-meta",
      children: [
        el("p", { cls: "cro-hdr-updated", text: "Atualizado em " + hojeExtenso() }),
        el("p", {
          cls: "cro-hdr-counts",
          text: nEntregas + " entregas · " + nGTs + " GTs · " + nMarcos + " marcos"
        })
      ]
    });

    var dias = diasParaEvento();
    var diasTxt = dias >= 0 ? String(dias) : "0";
    var labelDias = dias > 0 ? "dias p/ o evento" : (dias === 0 ? "é hoje!" : "evento realizado");
    var cartao = el("div", {
      cls: "cro-hdr-countdown",
      attrs: { "aria-label": diasTxt + " dias para o evento" },
      children: [
        el("div", { cls: "cro-countdown-num", text: diasTxt }),
        el("div", { cls: "cro-countdown-label", text: labelDias })
      ]
    });

    var direita = el("div", { cls: "cro-hdr-right", children: [meta, cartao] });

    return el("header", {
      cls: "cro-header",
      attrs: { "aria-label": "Cabeçalho do cronograma" },
      children: [esquerda, direita]
    });
  }

  /* ============================================================
     2. LEGENDA
     ============================================================ */
  function buildLegenda() {
    function swatch(cls) {
      return el("span", { cls: "cro-leg-swatch " + cls, attrs: { "aria-hidden": "true" } });
    }
    function item(cls, label) {
      return el("span", {
        cls: "cro-leg-item",
        children: [swatch(cls), el("span", { text: label })]
      });
    }
    return el("div", {
      cls: "cro-legend",
      attrs: { "aria-label": "Legenda" },
      children: [
        item("is-urgente", "Urgente"),
        item("is-pendente", "Pendente"),
        item("is-futuro", "Futuro"),
        item("is-concluido", "Concluído"),
        item("is-marco", "Marco crítico"),
        item("is-hoje", "Hoje")
      ]
    });
  }

  /* ============================================================
     3. MARCOS CRÍTICOS (grade por mês Jun..Nov)
     ============================================================ */
  function buildMarcos(crono) {
    var map = discById(crono);
    var marcos = crono.tarefas.filter(function (t) { return t.marco; });

    // Agrupa por mês do eixo (índice 0..5) usando a data de fim (ou início).
    var porMes = [];
    for (var i = 0; i < N_MESES; i++) porMes.push([]);
    marcos.forEach(function (t) {
      var d = parseISO(t.fim) || parseISO(t.inicio);
      if (!d) return;
      var idx = d.getMonth() + 1 - EIXO_MES_INI;
      if (idx < 0) idx = 0;
      if (idx > N_MESES - 1) idx = N_MESES - 1;
      porMes[idx].push(t);
    });

    var grade = el("div", { cls: "cro-marcos-grid" });
    for (var m = 0; m < N_MESES; m++) {
      var col = el("div", { cls: "cro-marcos-col" });
      col.appendChild(el("div", { cls: "cro-marcos-mes", text: MESES_LONGOS[m] }));

      var lista = ordenarTarefas(porMes[m]);
      if (lista.length === 0) {
        col.appendChild(el("div", { cls: "cro-marcos-vazio", text: "—" }));
      } else {
        lista.forEach(function (t) {
          var cls = classeVisual(t);
          var bolinha = el("span", {
            cls: "cro-marcos-dot is-" + cls,
            attrs: { "aria-hidden": "true" }
          });
          var estrela = el("span", {
            cls: "cro-marcos-star",
            text: "★",
            attrs: { "aria-hidden": "true" }
          });
          var nome = el("span", { cls: "cro-marcos-nome", text: t.nome });
          var data = el("span", {
            cls: "cro-marcos-data",
            text: t.fim ? Gestao.fmtData(t.fim) : (t.inicio ? Gestao.fmtData(t.inicio) : "")
          });
          col.appendChild(
            el("div", {
              cls: "cro-marcos-item",
              children: [
                el("span", { cls: "cro-marcos-itemhead", children: [estrela, bolinha, nome] }),
                data
              ]
            })
          );
        });
      }
      grade.appendChild(col);
    }

    return el("section", {
      cls: "cro-marcos",
      attrs: { "aria-label": "Marcos críticos do projeto" },
      children: [
        el("h3", { cls: "cro-marcos-titulo", text: "Marcos críticos do projeto" }),
        el("p", {
          cls: "cro-marcos-sub",
          text: "Pontos de controle que destravam o restante do plano, organizados por mês."
        }),
        grade
      ]
    });
  }

  /* ============================================================
     4. GANTT (tabela agrupada por GT)
     ============================================================ */
  // Larguras (px) das colunas fixas — devem casar com o CSS.
  var COL = {
    cod: 42,
    tarefa: 348,
    resp: 152,
    prazo: 78
  };

  function buildGantt(crono, onEditar) {
    var map = discById(crono);

    var card = el("div", { cls: "cro-gantt-card" });
    var scroll = el("div", { cls: "cro-gantt-scroll" });
    var gantt = el("div", { cls: "cro-gantt" });

    /* ---- Cabeçalho sticky ---- */
    gantt.appendChild(buildGanttHead());

    /* ---- Corpo ---- */
    var body = el("div", { cls: "cro-gantt-body" });

    // Agrupa por disciplina, na ordem das disciplinas (com filtros).
    var visiveis = crono.tarefas.filter(passaFiltro);
    var algumaLinha = false;

    crono.disciplinas.forEach(function (d) {
      var doGrupo = ordenarTarefas(
        visiveis.filter(function (t) { return t.disciplinaId === d.id; })
      );
      if (doGrupo.length === 0) return;
      algumaLinha = true;

      var ehEvento = d.id === "evento";
      body.appendChild(grupoHead(d, doGrupo.length, ehEvento));
      doGrupo.forEach(function (t) {
        body.appendChild(linhaTarefa(t, d, onEditar, ehEvento));
      });
    });

    // Tarefas órfãs (disciplina inexistente).
    var orfas = ordenarTarefas(
      visiveis.filter(function (t) { return !map[t.disciplinaId]; })
    );
    if (orfas.length > 0) {
      algumaLinha = true;
      var fake = { nome: "Sem disciplina", cor: "#6F6149", responsavel: "" };
      body.appendChild(grupoHead(fake, orfas.length, false));
      orfas.forEach(function (t) {
        body.appendChild(linhaTarefa(t, fake, onEditar, false));
      });
    }

    if (!algumaLinha) {
      body.appendChild(
        el("div", { cls: "cro-gantt-vazio", text: "Nenhuma tarefa corresponde aos filtros." })
      );
    }

    gantt.appendChild(body);
    scroll.appendChild(gantt);
    card.appendChild(scroll);
    return card;
  }

  // Cabeçalho com colunas fixas + eixo de meses.
  function buildGanttHead() {
    var head = el("div", { cls: "cro-gantt-head" });

    head.appendChild(el("div", { cls: "cro-cell cro-cell-cod", text: "Cód" }));
    head.appendChild(el("div", { cls: "cro-cell cro-cell-tarefa", text: "Tarefa / Entrega" }));
    head.appendChild(el("div", { cls: "cro-cell cro-cell-resp", text: "Responsável" }));
    head.appendChild(el("div", { cls: "cro-cell cro-cell-prazo", text: "Prazo" }));

    var timeline = el("div", { cls: "cro-cell cro-cell-timeline cro-axis" });
    EIXO_MESES.forEach(function (m) {
      timeline.appendChild(el("div", { cls: "cro-axis-month", text: m }));
    });
    head.appendChild(timeline);

    return head;
  }

  function grupoHead(disc, count, ehEvento) {
    var children = [
      el("span", {
        cls: "cro-group-bar",
        style: "background:" + (disc.cor || "#6F6149"),
        attrs: { "aria-hidden": "true" }
      }),
      el("span", { cls: "cro-group-name", text: disc.nome })
    ];
    if (disc.responsavel) {
      children.push(el("span", { cls: "cro-group-quem", text: disc.responsavel }));
    }
    children.push(
      el("span", {
        cls: "cro-group-count",
        text: count + (count === 1 ? " entrega" : " entregas")
      })
    );

    return el("div", {
      cls: "cro-group-head" + (ehEvento ? " is-evento" : ""),
      children: children
    });
  }

  function linhaTarefa(t, disc, onEditar, ehEvento) {
    var cor = disc.cor || "#6F6149";
    var vis = classeVisual(t);

    // Coluna código
    var celCod = el("div", {
      cls: "cro-cell cro-cell-cod",
      text: t.codigo ? t.codigo : (t.marco ? "★" : "")
    });

    // Coluna tarefa: bolinha de status + nome + observação
    var bolinha = el("span", {
      cls: "cro-row-dot is-" + vis,
      attrs: { "aria-hidden": "true" }
    });
    var nome = el("span", { cls: "cro-row-nome", text: t.nome });
    var headNome = el("div", { cls: "cro-row-nomehead", children: [bolinha, nome] });
    var tarefaChildren = [headNome];
    if (t.obs) {
      tarefaChildren.push(el("div", { cls: "cro-row-obs", text: t.obs }));
    }
    var celTarefa = el("div", { cls: "cro-cell cro-cell-tarefa", children: tarefaChildren });

    // Coluna responsável
    var celResp = el("div", {
      cls: "cro-cell cro-cell-resp",
      text: t.responsavel || "—",
      attrs: t.responsavel ? { title: t.responsavel } : {}
    });

    // Coluna prazo
    var celPrazo = el("div", {
      cls: "cro-cell cro-cell-prazo",
      text: t.fim ? Gestao.fmtData(t.fim).slice(0, 5) : (t.inicio ? "—" : "cont.")
    });

    // Coluna timeline (barra ou marco)
    var track = el("div", { cls: "cro-cell cro-cell-timeline cro-track" });
    track.appendChild(buildGridOverlay());
    if (t.marco) {
      track.appendChild(marcoNode(t, onEditar));
    } else {
      track.appendChild(barraNode(t, cor, vis, onEditar));
    }

    var linha = el("div", {
      cls: "cro-row" + (ehEvento ? " is-evento" : "") + (t.urgente ? " is-urgente-row" : ""),
      children: [celCod, celTarefa, celResp, celPrazo, track]
    });

    // Clique na linha (fora da barra) também edita.
    linha.addEventListener("click", function (e) {
      if (e.target.closest(".cro-bar, .cro-milestone")) return;
      onEditar(t.id);
    });

    return linha;
  }

  // Linhas de grade verticais por mês + faixa do evento + linha hoje,
  // desenhadas dentro de cada track (alinhadas ao eixo).
  function buildGridOverlay() {
    var grid = el("div", { cls: "cro-track-grid", attrs: { "aria-hidden": "true" } });
    // Bordas dos meses (entre meses): 1/6, 2/6, ...
    for (var i = 1; i < N_MESES; i++) {
      var left = (i / N_MESES) * 100;
      grid.appendChild(el("div", { cls: "cro-track-gridline", style: "left:" + left + "%" }));
    }
    // Faixa do evento (13–14/11).
    var evIni = fracaoMesDia(EVENTO_INI.mes, EVENTO_INI.dia);
    var evFim = fracaoMesDia(EVENTO_FIM.mes, EVENTO_FIM.dia);
    var w = Math.max(evFim - evIni, 0.8);
    grid.appendChild(
      el("div", { cls: "cro-track-evento", style: "left:" + evIni + "%;width:" + w + "%" })
    );
    // Linha "hoje".
    var h = hojeLocal();
    if (h.getFullYear() === EIXO_ANO) {
      var hf = fracaoData(h);
      if (hf != null) {
        grid.appendChild(el("div", { cls: "cro-track-hoje", style: "left:" + hf + "%" }));
      }
    }
    return grid;
  }

  function barraNode(t, cor, vis, onEditar) {
    var left = fracaoInicio(t);
    var right = fracaoFim(t);
    if (left == null && right == null) {
      // Sem datas: barra mínima no início do eixo (raro).
      left = 0;
      right = LARGURA_MIN_PCT;
    }
    if (left == null) left = right;
    if (right == null) right = left;
    var width = Math.max(right - left, LARGURA_MIN_PCT);
    if (left + width > 100) left = Math.max(0, 100 - width);

    var titulo = montarTitulo(t);

    // Cor: barra creme (futuro) usa cor neutra do design; demais usam
    // a cor do status, mas mantemos um leve tom da disciplina como acento.
    var paleta = COR[vis] || COR.pendente;

    var bar = el("button", {
      cls: "cro-bar is-" + vis,
      attrs: { type: "button", title: titulo, "aria-label": titulo },
      style:
        "left:" + left + "%;width:" + width + "%;" +
        "background:" + paleta.bg + ";color:" + paleta.fg + ";" +
        "border-color:" + paleta.border + ";",
      on: {
        click: function (e) {
          e.stopPropagation();
          onEditar(t.id);
        }
      }
    });

    if (vis === "concluido") {
      bar.appendChild(el("span", { cls: "cro-bar-check", text: "✓", attrs: { "aria-hidden": "true" } }));
    }
    return bar;
  }

  function marcoNode(t, onEditar) {
    var d = parseISO(t.fim) || parseISO(t.inicio);
    var left = d != null ? fracaoData(d) : 0;
    var titulo = montarTitulo(t);
    var losango = el("button", {
      cls: "cro-milestone",
      attrs: { type: "button", title: titulo, "aria-label": "Marco: " + titulo },
      style: "left:" + left + "%;",
      on: {
        click: function (e) {
          e.stopPropagation();
          onEditar(t.id);
        }
      }
    });
    return losango;
  }

  function montarTitulo(t) {
    var partes = [t.nome];
    if (t.responsavel) partes.push("· " + t.responsavel);
    var fim = Gestao.fmtData(t.fim);
    if (fim) partes.push("(prazo " + fim + ")");
    partes.push("[" + visualLabel(classeVisual(t)) + "]");
    if (t.marco) partes.push("★ marco");
    if (t.obs) partes.push("— " + t.obs);
    return partes.join(" ");
  }

  /* ============================================================
     TOOLBAR (título da seção + filtros + nova tarefa)
     ============================================================ */
  function buildToolbar(crono, onNova, onChange) {
    var btnNova = el("button", {
      cls: "btn btn-primary cro-btn-nova",
      attrs: { type: "button" },
      children: [
        el("span", { text: "+", attrs: { "aria-hidden": "true" } }),
        el("span", { text: " Nova tarefa" })
      ],
      on: { click: onNova }
    });

    // Linha 1: rótulo + ação
    var topo = el("div", {
      cls: "cro-toolbar-top",
      children: [
        el("h3", { cls: "cro-toolbar-titulo", text: "Gantt do projeto" }),
        btnNova
      ]
    });

    // Linha 2: filtros de GT
    var rowDisc = el("div", { cls: "cro-filter-row" });
    rowDisc.appendChild(el("span", { cls: "cro-filter-label", text: "GT" }));
    crono.disciplinas.forEach(function (d) {
      var ativo = !ui.discFiltro || ui.discFiltro.has(d.id);
      var dot = el("span", { cls: "cro-dot", style: "background:" + d.cor });
      rowDisc.appendChild(
        el("button", {
          cls: "cro-chip" + (ativo ? " is-on" : ""),
          attrs: { type: "button", "aria-pressed": ativo ? "true" : "false" },
          children: [dot, el("span", { text: d.nome })],
          on: {
            click: function () {
              toggleSetFiltro("discFiltro", d.id, crono.disciplinas.map(function (x) { return x.id; }));
              onChange();
            }
          }
        })
      );
    });

    // Linha 3: filtros de status + busca
    var rowStatus = el("div", { cls: "cro-filter-row" });
    rowStatus.appendChild(el("span", { cls: "cro-filter-label", text: "Status" }));
    VIS_OPTIONS.forEach(function (s) {
      var ativo = !ui.statusFiltro || ui.statusFiltro.has(s.id);
      rowStatus.appendChild(
        el("button", {
          cls: "cro-chip cro-chip-vis is-" + s.id + (ativo ? " is-on" : ""),
          attrs: { type: "button", "aria-pressed": ativo ? "true" : "false" },
          children: [el("span", { cls: "cro-chip-dot is-" + s.id }), el("span", { text: s.label })],
          on: {
            click: function () {
              toggleSetFiltro("statusFiltro", s.id, VIS_OPTIONS.map(function (x) { return x.id; }));
              onChange();
            }
          }
        })
      );
    });

    var busca = el("input", {
      cls: "cro-search",
      attrs: {
        type: "search",
        placeholder: "Buscar tarefa, responsável ou obs…",
        "aria-label": "Buscar tarefa",
        value: ui.busca
      }
    });
    busca.addEventListener("input", function () {
      ui.busca = busca.value.trim().toLowerCase();
      onChange({ keepFocus: true });
    });
    rowStatus.appendChild(busca);

    return el("section", {
      cls: "cro-toolbar",
      attrs: { "aria-label": "Controles do cronograma" },
      children: [topo, rowDisc, rowStatus]
    });
  }

  /* ============================================================
     MODAL — formulário de tarefa (criar / editar / excluir)
     ============================================================ */
  var modalAberto = null;

  function abrirModal(crono, tarefa, onSalvo) {
    fecharModal();

    var editando = !!tarefa;
    var dados = tarefa || {
      nome: "",
      codigo: null,
      disciplinaId: crono.disciplinas[0] ? crono.disciplinas[0].id : "",
      responsavel: "",
      inicio: "",
      fim: "",
      status: "pendente",
      urgente: false,
      marco: false,
      obs: ""
    };

    var inpNome = inputText("cro-f-nome", dados.nome, "Ex.: Curadoria de palestrantes");

    // Select de disciplina + "Nova disciplina…"
    var selDisc = el("select", { attrs: { id: "cro-f-disc" } });
    crono.disciplinas.forEach(function (d) {
      var op = el("option", { text: d.nome, attrs: { value: d.id } });
      if (d.id === dados.disciplinaId) op.selected = true;
      selDisc.appendChild(op);
    });
    selDisc.appendChild(el("option", { text: "+ Nova disciplina…", attrs: { value: "__nova__" } }));

    var inpDiscNome = inputText("cro-f-discnome", "", "Nome do GT / disciplina");
    var inpDiscCor = el("input", {
      attrs: { type: "color", value: DEFAULT_NEW_COLOR, id: "cro-f-disccor", "aria-label": "Cor da disciplina" }
    });
    var blocoNova = el("div", {
      cls: "cro-newdisc hidden",
      children: [
        field("Nome da nova disciplina", inpDiscNome),
        el("div", {
          cls: "cro-field",
          children: [
            el("label", { text: "Cor", attrs: { for: "cro-f-disccor" } }),
            el("div", { cls: "cro-color-row", children: [inpDiscCor] })
          ]
        })
      ]
    });
    selDisc.addEventListener("change", function () {
      blocoNova.classList.toggle("hidden", selDisc.value !== "__nova__");
    });

    var inpCodigo = inputText("cro-f-codigo", dados.codigo || "", "Ex.: 1.2.3 (opcional)");
    var inpResp = inputText("cro-f-resp", dados.responsavel || "", "Ex.: Maria · João");
    var inpIni = inputDate("cro-f-ini", isoCurto(dados.inicio));
    var inpFim = inputDate("cro-f-fim", isoCurto(dados.fim));

    var selStatus = el("select", { attrs: { id: "cro-f-status" } });
    STATUS_OPTIONS.forEach(function (s) {
      var op = el("option", { text: s.label, attrs: { value: s.id } });
      if (s.id === dados.status) op.selected = true;
      selStatus.appendChild(op);
    });

    var chkUrgente = el("input", { attrs: { type: "checkbox", id: "cro-f-urgente" } });
    chkUrgente.checked = !!dados.urgente;
    var chkMarco = el("input", { attrs: { type: "checkbox", id: "cro-f-marco" } });
    chkMarco.checked = !!dados.marco;

    var inpObs = el("textarea", {
      cls: "cro-textarea",
      attrs: { id: "cro-f-obs", rows: "2", placeholder: "Observação curta (opcional)" }
    });
    inpObs.value = dados.obs || "";

    var erro = el("div", { cls: "cro-form-error hidden", attrs: { role: "alert" } });

    var btnCancelar = el("button", {
      cls: "btn", text: "Cancelar", attrs: { type: "button" }, on: { click: fecharModal }
    });
    var btnSalvar = el("button", {
      cls: "btn btn-primary",
      text: editando ? "Salvar alterações" : "Criar tarefa",
      attrs: { type: "submit" }
    });
    var direita = el("div", { cls: "cro-modal-right", children: [btnCancelar, btnSalvar] });

    var acoesChildren = [];
    if (editando) {
      acoesChildren.push(
        el("button", {
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
        })
      );
    }
    acoesChildren.push(direita);
    var acoes = el("div", { cls: "cro-modal-actions", children: acoesChildren });

    var form = el("form", {
      attrs: { novalidate: "novalidate" },
      children: [
        field("Nome da tarefa", inpNome),
        field("GT / disciplina", selDisc),
        blocoNova,
        el("div", {
          cls: "cro-field-row",
          children: [field("Código (EAP)", inpCodigo), field("Responsável", inpResp)]
        }),
        el("div", {
          cls: "cro-field-row",
          children: [field("Início", inpIni), field("Prazo / fim", inpFim)]
        }),
        field("Status", selStatus),
        el("div", {
          cls: "cro-check-row",
          children: [
            el("label", {
              cls: "cro-check",
              children: [chkUrgente, el("span", { text: "Urgente" })]
            }),
            el("label", {
              cls: "cro-check",
              children: [chkMarco, el("span", { text: "É um marco (★)" })]
            })
          ]
        }),
        field("Observação", inpObs),
        erro,
        acoes
      ]
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var res = coletarESalvar({
        crono: crono, tarefa: tarefa,
        inpNome: inpNome, selDisc: selDisc, inpDiscNome: inpDiscNome, inpDiscCor: inpDiscCor,
        inpCodigo: inpCodigo, inpResp: inpResp, inpIni: inpIni, inpFim: inpFim,
        selStatus: selStatus, chkUrgente: chkUrgente, chkMarco: chkMarco, inpObs: inpObs
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
      children: [el("h3", { cls: "cro-modal-title", text: editando ? "Editar tarefa" : "Nova tarefa" }), form]
    });

    var overlay = el("div", {
      cls: "cro-modal-overlay",
      on: { click: function (e) { void e; /* clicar fora NÃO fecha (evita perda acidental); use Cancelar ou Esc */ } },
      children: [modal]
    });

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

  function coletarESalvar(f) {
    var nome = f.inpNome.value.trim();
    if (!nome) return { ok: false, erro: "Informe o nome da tarefa." };

    var disciplinaId = f.selDisc.value;
    if (disciplinaId === "__nova__") {
      var nomeDisc = f.inpDiscNome.value.trim();
      if (!nomeDisc) return { ok: false, erro: "Informe o nome da nova disciplina." };
      var novoId = idDisciplinaUnico(f.crono, nomeDisc);
      f.crono.disciplinas.push({
        id: novoId,
        nome: nomeDisc,
        cor: f.inpDiscCor.value || DEFAULT_NEW_COLOR,
        responsavel: ""
      });
      disciplinaId = novoId;
    }
    if (!disciplinaId) return { ok: false, erro: "Selecione ou crie uma disciplina." };

    var ini = f.inpIni.value || null;
    var fim = f.inpFim.value || null;
    if (ini && fim && fim < ini) {
      return { ok: false, erro: "O prazo (fim) não pode ser anterior ao início." };
    }

    var status = f.selStatus.value;
    var urgente = f.chkUrgente.checked;
    var marco = f.chkMarco.checked;
    var progresso = status === "concluido" ? 100 : 0;
    var codigo = f.inpCodigo.value.trim() || null;
    var responsavel = f.inpResp.value.trim() || null;
    var obs = f.inpObs.value.trim() || "";

    if (f.tarefa) {
      var t = f.tarefa;
      t.nome = nome;
      t.codigo = codigo;
      t.disciplinaId = disciplinaId;
      t.responsavel = responsavel;
      t.inicio = ini;
      t.fim = fim;
      t.status = status;
      t.urgente = urgente;
      t.marco = marco;
      t.progresso = progresso;
      t.obs = obs;
    } else {
      f.crono.tarefas.push({
        id: Gestao.uid("t"),
        codigo: codigo,
        disciplinaId: disciplinaId,
        nome: nome,
        responsavel: responsavel,
        inicio: ini,
        fim: fim,
        status: status,
        urgente: urgente,
        marco: marco,
        progresso: progresso,
        obs: obs
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
      children: [el("label", { text: label, attrs: id ? { for: id } : {} }), control]
    });
  }

  /* ============================================================
     RENDER PRINCIPAL
     ============================================================ */
  function render(mount, data) {
    ensureHead();
    var crono = getCrono(data);

    clear(mount);
    mount.classList.add("cro-root");

    function rerender() { render(mount, data); }

    function editarPorId(id) {
      var t = crono.tarefas.filter(function (x) { return x.id === id; })[0];
      if (t) abrirModal(crono, t, rerender);
    }
    function novaTarefa() {
      abrirModal(crono, null, rerender);
    }

    // 1. Header
    mount.appendChild(buildHeader(crono));

    // 2. Legenda
    mount.appendChild(buildLegenda());

    // 3. Marcos críticos
    mount.appendChild(buildMarcos(crono));

    // Toolbar (título + filtros + nova)
    var toolbar = buildToolbar(crono, novaTarefa, function (opts) {
      if (opts && opts.keepFocus) {
        atualizarSomenteGantt(mount, crono, editarPorId);
      } else {
        rerender();
      }
    });
    mount.appendChild(toolbar);

    // 4. Gantt
    var gantt = buildGantt(crono, editarPorId);
    gantt.setAttribute("data-cro-gantt-root", "1");
    mount.appendChild(gantt);
  }

  // Atualiza apenas o Gantt (preserva foco do campo de busca).
  function atualizarSomenteGantt(mount, crono, editarPorId) {
    var antigo = mount.querySelector('[data-cro-gantt-root]');
    if (!antigo) return;
    var novo = buildGantt(crono, editarPorId);
    novo.setAttribute("data-cro-gantt-root", "1");
    antigo.parentNode.replaceChild(novo, antigo);
  }

  /* ============================================================
     Registro no app
     ============================================================ */
  function registrar() {
    if (window.Gestao && typeof Gestao.onTab === "function") {
      Gestao.onTab("tab-cronograma", render);
      return true;
    }
    return false;
  }

  if (!registrar()) {
    document.addEventListener("DOMContentLoaded", registrar);
  }
})();
