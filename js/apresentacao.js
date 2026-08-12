/* ============================================================
   apresentacao.js — Módulo Apresentação (aba "Apresentação")
   ------------------------------------------------------------
   Monta um DECK de slides 16:9 com o retrato gerencial do
   Summit, alimentado pelos dados vivos do app. Substitui o
   trabalho manual de remontar a apresentação a cada ciclo.

   Fonte dos números: window.Relatorios (exposto por
   js/relatorios.js). A matemática NÃO é duplicada aqui — assim
   o deck e a aba Relatórios nunca divergem. Este módulo cuida
   só do layout de slide.

   Contrato consumido:
     Gestao.data · Gestao.fmtBRL(n) · Gestao.fmtData(iso)
     Gestao.save() · Gestao.onTab(id, fn) · Gestao.pageHeader
     Gestao.headerStat · Gestao.tabEditavel(id)
     Relatorios.computeFinanceiro / receitaCategorias /
       computePorCategoria / computePipeline / computeCompliance /
       formatMetaValor / pct / sumBy / parseISO / diasParaEvento

   Escrita: só o campo de notas (Gestao.data.apresentacao.notas).
   Todo o resto é derivado — sem CRUD.

   Navegação: um slide por vez na tela (setas ◀ ▶ e teclado);
   na impressão todos aparecem, um por página, em paisagem.

   Segurança: todo dado entra no DOM via textContent/createElement
   — nunca innerHTML com valores do usuário.
   ============================================================ */

(function () {
  "use strict";

  var TAB_ID = "tab-apresentacao";

  /* ---- Constantes do evento (espelham relatorios.js) ---- */
  var EVENTO_ISO = "2026-11-13";
  var EVENTO_TITULO = "Summit POA PMIRS 2026";
  var EVENTO_SUB = "Tecnopuc, Porto Alegre · 13–14 de novembro de 2026";
  var LOGO_SRC = "assets/pmirs-horizontal-color.png";
  var LOGO_ALT = "PMI Rio Grande do Sul Chapter";

  var MAX_PRAZOS = 8;   // próximos prazos que cabem num slide
  var MAX_BARRAS = 7;   // categorias por gráfico (o resto vira "Outros")

  /* ============================================================
     Injeção do CSS do módulo (sem tocar no index.html)
     ============================================================ */
  function ensureStyles() {
    if (document.getElementById("apresentacao-css")) return;
    var link = document.createElement("link");
    link.id = "apresentacao-css";
    link.rel = "stylesheet";
    link.href = "css/apresentacao.css";
    document.head.appendChild(link);
  }

  /* ============================================================
     Helpers de DOM (seguros: textContent, nunca innerHTML c/ dados)
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
     Acesso ao núcleo de cálculo e aos dados
     ============================================================ */

  // window.Relatorios pode faltar se js/relatorios.js não carregou.
  // Nesse caso o deck degrada para um aviso em vez de quebrar a aba.
  function calc() {
    return window.Relatorios || null;
  }

  function getData() {
    return (window.Gestao && window.Gestao.data) || {};
  }

  function getFinanceiro() {
    var f = getData().financeiro || {};
    return {
      receitas: Array.isArray(f.receitas) ? f.receitas : [],
      despesas: Array.isArray(f.despesas) ? f.despesas : [],
      inscricoes: f.inscricoes || null
    };
  }

  function getContratacoes() {
    var c = getData().contratacoes || {};
    return {
      fornecedores: Array.isArray(c.fornecedores) ? c.fornecedores : []
    };
  }

  function getCronograma() {
    var c = getData().cronograma || {};
    return {
      disciplinas: Array.isArray(c.disciplinas) ? c.disciplinas : [],
      tarefas: Array.isArray(c.tarefas) ? c.tarefas : []
    };
  }

  function getMetas() {
    var m = getData().metas || {};
    return Array.isArray(m.metas) ? m.metas : [];
  }

  function getPatrocinadores() {
    var p = getData().patrocinio || {};
    return Array.isArray(p.patrocinadores) ? p.patrocinadores : [];
  }

  function fmtBRL(n) {
    var G = window.Gestao;
    return G && G.fmtBRL ? G.fmtBRL(n) : "R$ " + (Number(n) || 0).toFixed(2);
  }

  function fmtData(iso) {
    var G = window.Gestao;
    if (G && G.fmtData) return G.fmtData(iso);
    return iso ? String(iso) : "";
  }

  // Este é um relatório financeiro: os valores saem SEMPRE exatos
  // (mesmo formato da aba Relatórios e da aba Financeiro). Nada de
  // arredondar para "R$ 377 mil" — o CSS é que se adapta ao número.

  /* ============================================================
     Blocos visuais do slide
     ============================================================ */

  // Cabeçalho comum a todo slide de conteúdo.
  function slideHead(titulo, subtitulo) {
    var head = el("header", "apr-slide__head");

    var txt = el("div", "apr-slide__headtext");
    txt.appendChild(el("h3", "apr-slide__title", titulo));
    if (subtitulo) txt.appendChild(el("p", "apr-slide__sub", subtitulo));
    head.appendChild(txt);

    var logo = el("img", "apr-slide__logo");
    logo.src = LOGO_SRC;
    logo.alt = LOGO_ALT;
    head.appendChild(logo);

    return head;
  }

  // Rodapé com o nº do slide.
  function slideFoot(num, total) {
    var foot = el("footer", "apr-slide__foot");
    foot.appendChild(el("span", null, EVENTO_TITULO));
    foot.appendChild(el("span", "apr-slide__num", num + " / " + total));
    return foot;
  }

  // Cartão de indicador. variant: is-positivo | is-negativo | is-destaque
  function kpi(label, valor, sub, variant) {
    var card = el("div", "apr-kpi" + (variant ? " " + variant : ""));
    card.appendChild(el("span", "apr-kpi__label", label));
    card.appendChild(el("span", "apr-kpi__value", valor));
    if (sub) card.appendChild(el("span", "apr-kpi__sub", sub));
    return card;
  }

  // Barra horizontal proporcional. items = [{label, valor}]
  function hbar(items, corClass) {
    var wrap = el("div", "apr-hbar");
    var lista = items || [];
    var total = lista.reduce(function (a, it) {
      return a + (Number(it.valor) || 0);
    }, 0);
    var max = lista.reduce(function (a, it) {
      return Math.max(a, Number(it.valor) || 0);
    }, 0);

    if (!lista.length) {
      wrap.appendChild(el("p", "apr-empty", "Sem dados para o gráfico."));
      return wrap;
    }

    lista.forEach(function (it, i) {
      var v = Number(it.valor) || 0;
      var w = max > 0 ? Math.min(100, (v / max) * 100) : 0;

      var row = el("div", "apr-hbar__row");
      row.appendChild(el("span", "apr-hbar__label", it.label));

      var track = el("div", "apr-hbar__track");
      var fill = el("span", "apr-hbar__fill " + (corClass || "apr-c" + (i % 4)));
      fill.style.width = w.toFixed(1) + "%";
      track.appendChild(fill);
      row.appendChild(track);

      var caption = fmtBRL(v);
      if (total > 0) caption += " · " + Math.round((v / total) * 100) + "%";
      row.appendChild(el("span", "apr-hbar__val", caption));

      wrap.appendChild(row);
    });
    return wrap;
  }

  // Barra previsto × realizado (uma linha).
  function progresso(label, realizado, previsto, corClass) {
    var row = el("div", "apr-prog");

    var top = el("div", "apr-prog__top");
    top.appendChild(el("strong", null, label));
    top.appendChild(
      el("span", "apr-prog__cap", fmtBRL(realizado) + " de " + fmtBRL(previsto))
    );
    row.appendChild(top);

    var p = previsto > 0 ? Math.min(100, (realizado / previsto) * 100) : 0;
    var track = el("div", "apr-prog__track");
    var fill = el("span", "apr-prog__fill " + (corClass || ""));
    fill.style.width = p.toFixed(1) + "%";
    track.appendChild(fill);
    row.appendChild(track);

    row.appendChild(
      el("span", "apr-prog__pct", p.toFixed(0).replace(".", ",") + "% executado")
    );
    return row;
  }

  // Tabela compacta. cols = [{label, num, render(row)}]
  function tabela(cols, rows, vazioMsg) {
    if (!rows || !rows.length) {
      return el("p", "apr-empty", vazioMsg || "Sem itens.");
    }
    var wrap = el("div", "apr-table-wrap");
    var t = el("table", "apr-table");

    var thead = el("thead");
    var trh = el("tr");
    cols.forEach(function (c) {
      trh.appendChild(el("th", c.num ? "num" : null, c.label));
    });
    thead.appendChild(trh);
    t.appendChild(thead);

    var tbody = el("tbody");
    rows.forEach(function (row) {
      var tr = el("tr");
      cols.forEach(function (c) {
        var td = el("td", c.num ? "num" : null);
        var content = c.render ? c.render(row) : row[c.key];
        if (content instanceof Node) {
          td.appendChild(content);
        } else {
          td.textContent = content == null ? "—" : String(content);
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    t.appendChild(tbody);

    wrap.appendChild(t);
    return wrap;
  }

  // Corta a lista em MAX_BARRAS e agrupa a cauda em "Outros".
  function limitarCategorias(items) {
    var lista = (items || []).slice();
    if (lista.length <= MAX_BARRAS) return lista;
    var head = lista.slice(0, MAX_BARRAS - 1);
    var resto = lista.slice(MAX_BARRAS - 1);
    var soma = resto.reduce(function (a, it) {
      return a + (Number(it.valor) || 0);
    }, 0);
    head.push({ label: "Outros (" + resto.length + ")", valor: soma });
    return head;
  }

  /* ============================================================
     Notas editáveis (único ponto de escrita do módulo)
     ------------------------------------------------------------
     Persistem em Gestao.data.apresentacao.notas.<chave> e são
     salvas no blur. O modo somente-leitura é aplicado pelo
     próprio app (aplicarReadonly desabilita textareas).
     ============================================================ */
  function getNotas() {
    var d = getData();
    if (!d.apresentacao || typeof d.apresentacao !== "object") {
      d.apresentacao = {};
    }
    if (!d.apresentacao.notas || typeof d.apresentacao.notas !== "object") {
      d.apresentacao.notas = {};
    }
    return d.apresentacao.notas;
  }

  // grande = a nota ocupa a altura livre do slide (quando ela É o
  // conteúdo principal). Sem isso, fica compacta abaixo dos dados.
  function campoNota(chave, rotulo, placeholder, grande) {
    var notas = getNotas();
    var box = el("div", "apr-nota" + (grande ? " apr-nota--grande" : ""));

    var id = "apr-nota-" + chave;
    var lab = el("label", "apr-nota__label", rotulo);
    lab.setAttribute("for", id);
    box.appendChild(lab);

    // Espelho só-impressão: um <textarea> imprime apenas o que cabe
    // na sua altura visível, então o texto vai também para um <p>
    // que a folha mostra no lugar do campo.
    var espelho = el("p", "apr-nota__print", notas[chave] || "");

    var ta = document.createElement("textarea");
    ta.className = "apr-nota__input";
    ta.id = id;
    ta.rows = 3;
    ta.placeholder = placeholder || "";
    ta.value = notas[chave] || "";
    ta.addEventListener("input", function () {
      espelho.textContent = ta.value;
    });
    ta.addEventListener("blur", function () {
      var atual = getNotas();
      if (atual[chave] === ta.value) return;
      atual[chave] = ta.value;
      if (window.Gestao && window.Gestao.save) window.Gestao.save();
    });
    box.appendChild(ta);
    box.appendChild(espelho);

    return box;
  }

  /* ============================================================
     SLIDES
     ------------------------------------------------------------
     Cada builder recebe (num, total) e devolve uma <section>.
     ============================================================ */

  /* ---- 1. Capa ---- */
  function slideCapa(num, total) {
    var R = calc();
    var s = el("section", "apr-slide apr-slide--capa");

    var logo = el("img", "apr-capa__logo");
    logo.src = LOGO_SRC;
    logo.alt = LOGO_ALT;
    s.appendChild(logo);

    s.appendChild(el("p", "apr-capa__eyebrow", "Relatório gerencial"));
    s.appendChild(el("h2", "apr-capa__title", EVENTO_TITULO));
    s.appendChild(el("p", "apr-capa__sub", EVENTO_SUB));

    var dias = R ? R.diasParaEvento() : 0;
    var chips = el("div", "apr-capa__chips");
    chips.appendChild(
      el(
        "span",
        "apr-chip",
        dias > 0
          ? dias + " dias para o evento"
          : dias === 0
          ? "O evento é hoje"
          : "Evento há " + Math.abs(dias) + " dias"
      )
    );
    chips.appendChild(
      el("span", "apr-chip", "Gerado em " + fmtData(R ? R.hojeISO() : ""))
    );
    s.appendChild(chips);

    s.appendChild(slideFoot(num, total));
    return s;
  }

  /* ---- 2. Resumo executivo ---- */
  function slideResumo(num, total) {
    var R = calc();
    var s = el("section", "apr-slide");
    s.appendChild(
      slideHead("Resumo executivo", "Posição consolidada de receita, despesa e saldo")
    );

    var body = el("div", "apr-slide__body");
    var k = R.computeFinanceiro(getFinanceiro(), getContratacoes());

    var grid = el("div", "apr-kpi-grid apr-kpi-grid--4");
    grid.appendChild(
      kpi("Receita prevista", fmtBRL(k.recPrev), "potencial de arrecadação", "is-destaque")
    );
    grid.appendChild(
      kpi(
        "Receita realizada",
        fmtBRL(k.recReal),
        R.pct(k.recReal, k.recPrev, 1) + " da previsão",
        "is-positivo"
      )
    );
    grid.appendChild(
      kpi("Despesa prevista", fmtBRL(k.despPrev), "orçamento planejado")
    );
    grid.appendChild(
      kpi(
        "Despesa realizada",
        fmtBRL(k.despReal),
        R.pct(k.despReal, k.despPrev, 1) + " do orçamento",
        "is-negativo"
      )
    );
    grid.appendChild(
      kpi(
        "Saldo projetado",
        fmtBRL(k.saldoProjetado),
        "receita prev. − despesa prev.",
        k.saldoProjetado >= 0 ? "is-positivo" : "is-negativo"
      )
    );
    grid.appendChild(
      kpi(
        "Saldo realizado",
        fmtBRL(k.saldoRealizado),
        "receita real. − despesa real.",
        k.saldoRealizado >= 0 ? "is-positivo" : "is-negativo"
      )
    );
    grid.appendChild(
      kpi(
        "Contratado",
        fmtBRL(k.comprometido),
        k.nFechados + (k.nFechados === 1 ? " contrato fechado" : " contratos fechados")
      )
    );
    grid.appendChild(
      kpi("Em negociação", fmtBRL(k.emNegociacao), "valor ainda em pipeline")
    );
    body.appendChild(grid);

    body.appendChild(
      campoNota(
        "resumo",
        "Comentário da coordenação",
        "Leitura do momento, riscos e decisões pendentes. Aparece na impressão."
      )
    );

    s.appendChild(body);
    s.appendChild(slideFoot(num, total));
    return s;
  }

  /* ---- 3. Receitas ---- */
  function slideReceitas(num, total) {
    var R = calc();
    var fin = getFinanceiro();
    var k = R.computeFinanceiro(fin, getContratacoes());
    var cats = limitarCategorias(R.receitaCategorias(fin));

    var s = el("section", "apr-slide");
    s.appendChild(
      slideHead("Receitas", "Composição prevista por origem e execução no período")
    );

    var body = el("div", "apr-slide__body apr-cols");

    var esq = el("div", "apr-col");
    esq.appendChild(el("h4", "apr-bloco__titulo", "Previsto por origem"));
    esq.appendChild(hbar(cats, "apr-c-verde"));
    body.appendChild(esq);

    var dir = el("div", "apr-col");
    dir.appendChild(el("h4", "apr-bloco__titulo", "Execução"));
    dir.appendChild(progresso("Receitas", k.recReal, k.recPrev, "apr-c-verde"));

    var mini = el("div", "apr-kpi-grid apr-kpi-grid--2");
    mini.appendChild(kpi("Previsto", fmtBRL(k.recPrev), "total"));
    mini.appendChild(
      kpi("Realizado", fmtBRL(k.recReal), "arrecadado", "is-positivo")
    );
    dir.appendChild(mini);

    dir.appendChild(
      tabela(
        [
          { label: "Origem", render: function (r) { return r.label; } },
          { label: "Previsto", num: true, render: function (r) { return fmtBRL(r.valor); } }
        ],
        cats,
        "Nenhuma receita cadastrada."
      )
    );
    body.appendChild(dir);

    s.appendChild(body);
    s.appendChild(slideFoot(num, total));
    return s;
  }

  /* ---- 4. Despesas ---- */
  function slideDespesas(num, total) {
    var R = calc();
    var fin = getFinanceiro();
    var contr = getContratacoes();
    var k = R.computeFinanceiro(fin, contr);
    var cats = limitarCategorias(R.computePorCategoria(fin.despesas, "previsto"));

    var s = el("section", "apr-slide");
    s.appendChild(
      slideHead("Despesas", "Orçamento por categoria e comprometimento em contratos")
    );

    var body = el("div", "apr-slide__body apr-cols");

    var esq = el("div", "apr-col");
    esq.appendChild(el("h4", "apr-bloco__titulo", "Previsto por categoria"));
    esq.appendChild(hbar(cats, "apr-c-laranja"));
    body.appendChild(esq);

    var dir = el("div", "apr-col");
    dir.appendChild(el("h4", "apr-bloco__titulo", "Execução"));
    dir.appendChild(progresso("Despesas", k.despReal, k.despPrev, "apr-c-laranja"));

    var mini = el("div", "apr-kpi-grid apr-kpi-grid--2");
    mini.appendChild(kpi("Orçado", fmtBRL(k.despPrev), "previsto"));
    mini.appendChild(
      kpi("Comprometido", fmtBRL(k.comprometido), "contratos fechados", "is-negativo")
    );
    dir.appendChild(mini);

    dir.appendChild(
      tabela(
        [
          { label: "Categoria", render: function (r) { return r.label; } },
          { label: "Previsto", num: true, render: function (r) { return fmtBRL(r.valor); } }
        ],
        cats,
        "Nenhuma despesa cadastrada."
      )
    );
    body.appendChild(dir);

    s.appendChild(body);
    s.appendChild(slideFoot(num, total));
    return s;
  }

  /* ---- 5. Contratações ---- */
  function slideContratacoes(num, total) {
    var R = calc();
    var contr = getContratacoes();
    var pipeline = R.computePipeline(contr);
    var maxVal = pipeline.reduce(function (a, p) {
      return Math.max(a, Number(p.valor) || 0);
    }, 0);

    var s = el("section", "apr-slide");
    s.appendChild(
      slideHead("Contratações", "Funil de fornecedores por estágio de negociação")
    );

    var body = el("div", "apr-slide__body");

    var cores = ["apr-c-azul", "apr-c-laranja", "apr-c-verde"];
    var chart = el("div", "apr-colchart");
    pipeline.forEach(function (p, i) {
      var v = Number(p.valor) || 0;
      var h = maxVal > 0 ? Math.max(3, (v / maxVal) * 100) : 3;

      var col = el("div", "apr-colchart__col");
      col.appendChild(el("span", "apr-colchart__val", fmtBRL(v)));

      var area = el("div", "apr-colchart__area");
      var bar = el("span", "apr-colchart__bar " + cores[i % cores.length]);
      bar.style.height = h.toFixed(1) + "%";
      area.appendChild(bar);
      col.appendChild(area);

      var foot = el("div", "apr-colchart__foot");
      foot.appendChild(el("span", "apr-colchart__label", p.label));
      foot.appendChild(
        el("span", "apr-colchart__qtd", p.qtd + (p.qtd === 1 ? " contrato" : " contratos"))
      );
      col.appendChild(foot);

      chart.appendChild(col);
    });
    body.appendChild(chart);

    var fechados = contr.fornecedores.filter(function (f) {
      return f.status === "fechado";
    });
    var comProposta = fechados.filter(function (f) {
      return R.temProposta(f);
    }).length;

    var grid = el("div", "apr-kpi-grid apr-kpi-grid--3");
    grid.appendChild(
      kpi("Fornecedores", String(contr.fornecedores.length), "no pipeline", "is-destaque")
    );
    grid.appendChild(
      kpi("Total contratado", fmtBRL(R.sumBy(fechados, "valor")), fechados.length + " fechados")
    );
    grid.appendChild(
      kpi(
        "Propostas arquivadas",
        comProposta + " / " + fechados.length,
        "documentação dos contratos",
        comProposta === fechados.length ? "is-positivo" : "is-negativo"
      )
    );
    body.appendChild(grid);

    s.appendChild(body);
    s.appendChild(slideFoot(num, total));
    return s;
  }

  /* ---- 6. Patrocínio ---- */
  var COTAS = { diamante: "Diamante", premium: "Premium", master: "Master" };
  var COTA_ORDER = ["diamante", "premium", "master"];

  function slidePatrocinio(num, total) {
    var lista = getPatrocinadores();

    var s = el("section", "apr-slide");
    s.appendChild(
      slideHead("Patrocínio", "Cotas confirmadas e pipeline de prospecção")
    );

    var body = el("div", "apr-slide__body apr-cols");

    // Confirmados por cota (quantidade + valor).
    var porCota = COTA_ORDER.map(function (k) {
      var doCota = lista.filter(function (p) {
        return p.cota === k && p.status === "confirmado";
      });
      return {
        label: COTAS[k],
        qtd: doCota.length,
        valor: doCota.reduce(function (a, p) {
          return a + (Number(p.valor) || 0);
        }, 0)
      };
    });

    var esq = el("div", "apr-col");
    esq.appendChild(el("h4", "apr-bloco__titulo", "Confirmados por cota"));
    esq.appendChild(hbar(porCota, "apr-c-roxo"));
    esq.appendChild(
      tabela(
        [
          { label: "Cota", render: function (r) { return r.label; } },
          { label: "Qtd.", num: true, render: function (r) { return String(r.qtd); } },
          { label: "Valor", num: true, render: function (r) { return fmtBRL(r.valor); } }
        ],
        porCota,
        "Nenhuma cota confirmada."
      )
    );
    body.appendChild(esq);

    // Funil por estágio.
    var confirmados = lista.filter(function (p) {
      return p.status === "confirmado";
    });
    var emAndamento = lista.filter(function (p) {
      return ["contato", "proposta", "aguardando", "aprovado"].indexOf(p.status) !== -1;
    });
    var valorConf = confirmados.reduce(function (a, p) {
      return a + (Number(p.valor) || 0);
    }, 0);

    var dir = el("div", "apr-col");
    dir.appendChild(el("h4", "apr-bloco__titulo", "Pipeline"));

    var grid = el("div", "apr-kpi-grid apr-kpi-grid--2");
    grid.appendChild(
      kpi("Confirmados", String(confirmados.length), fmtBRL(valorConf), "is-positivo")
    );
    grid.appendChild(
      kpi("Em negociação", String(emAndamento.length), "contato → aprovado")
    );
    grid.appendChild(
      kpi("Prospectados", String(lista.length), "total na base", "is-destaque")
    );
    grid.appendChild(
      kpi(
        "Recusados",
        String(
          lista.filter(function (p) {
            return p.status === "recusado";
          }).length
        ),
        "fora do funil"
      )
    );
    dir.appendChild(grid);

    dir.appendChild(
      tabela(
        [
          { label: "Patrocinador", render: function (p) { return p.nome || "—"; } },
          { label: "Cota", render: function (p) { return COTAS[p.cota] || "—"; } },
          { label: "Valor", num: true, render: function (p) { return fmtBRL(p.valor); } }
        ],
        confirmados.slice(0, 6),
        "Nenhum patrocinador confirmado."
      )
    );
    body.appendChild(dir);

    s.appendChild(body);
    s.appendChild(slideFoot(num, total));
    return s;
  }

  /* ---- 7. Cronograma ---- */
  function slideCronograma(num, total) {
    var R = calc();
    var cron = getCronograma();
    var tarefas = cron.tarefas;

    var s = el("section", "apr-slide");
    s.appendChild(
      slideHead("Cronograma", "Avanço por grupo de trabalho e prazos mais próximos")
    );

    var body = el("div", "apr-slide__body apr-cols");

    var nomeDisc = {};
    cron.disciplinas.forEach(function (d) {
      nomeDisc[d.id] = d.nome || d.id;
    });

    // Avanço por GT.
    var gtRows = cron.disciplinas
      .map(function (d) {
        var doGt = tarefas.filter(function (t) {
          return t.disciplinaId === d.id;
        });
        var c = doGt.filter(function (t) {
          return t.status === "concluido";
        }).length;
        return {
          label: nomeDisc[d.id],
          concl: c,
          total: doGt.length,
          valor: doGt.length > 0 ? (c / doGt.length) * 100 : 0
        };
      })
      .filter(function (r) {
        return r.total > 0;
      })
      .sort(function (a, b) {
        return b.valor - a.valor;
      });

    var esq = el("div", "apr-col");
    esq.appendChild(el("h4", "apr-bloco__titulo", "Avanço por GT"));
    esq.appendChild(
      tabela(
        [
          { label: "GT", render: function (r) { return r.label; } },
          {
            label: "Concl.",
            num: true,
            render: function (r) { return r.concl + " / " + r.total; }
          },
          {
            label: "%",
            num: true,
            render: function (r) { return Math.round(r.valor) + "%"; }
          },
          {
            label: "",
            render: function (r) {
              var track = el("div", "apr-minibar");
              var fill = el("span");
              fill.style.width = Math.min(100, r.valor).toFixed(0) + "%";
              track.appendChild(fill);
              return track;
            }
          }
        ],
        gtRows,
        "Nenhuma disciplina com tarefas."
      )
    );
    body.appendChild(esq);

    // Próximos prazos.
    var proximos = tarefas
      .filter(function (t) {
        return t.status !== "concluido" && R.parseISO(t.fim);
      })
      .sort(function (a, b) {
        return R.parseISO(a.fim).getTime() - R.parseISO(b.fim).getTime();
      })
      .slice(0, MAX_PRAZOS);

    var hoje = R.hojeLocal();

    var dir = el("div", "apr-col");
    dir.appendChild(el("h4", "apr-bloco__titulo", "Próximos prazos"));
    dir.appendChild(
      tabela(
        [
          { label: "Tarefa", render: function (t) { return t.nome || "—"; } },
          {
            label: "GT",
            render: function (t) { return nomeDisc[t.disciplinaId] || "—"; }
          },
          {
            label: "Prazo",
            num: true,
            render: function (t) {
              var d = R.parseISO(t.fim);
              var atrasada = d && d.getTime() < hoje.getTime();
              var span = el(
                "span",
                atrasada ? "apr-atrasado" : null,
                fmtData(t.fim)
              );
              return span;
            }
          }
        ],
        proximos,
        "Nenhum prazo pendente."
      )
    );
    body.appendChild(dir);

    // Contadores gerais no rodapé do corpo.
    var concl = tarefas.filter(function (t) {
      return t.status === "concluido";
    }).length;
    var andamento = tarefas.filter(function (t) {
      return t.status === "andamento";
    }).length;
    var atrasadas = tarefas.filter(function (t) {
      var d = R.parseISO(t.fim);
      return t.status !== "concluido" && d && d.getTime() < hoje.getTime();
    }).length;

    var grid = el("div", "apr-kpi-grid apr-kpi-grid--4 apr-span2");
    grid.appendChild(
      kpi("Avanço geral", R.pct(concl, tarefas.length), concl + " de " + tarefas.length, "is-destaque")
    );
    grid.appendChild(kpi("Em andamento", String(andamento), "tarefas ativas"));
    grid.appendChild(
      kpi(
        "Atrasadas",
        String(atrasadas),
        "prazo vencido",
        atrasadas > 0 ? "is-negativo" : "is-positivo"
      )
    );
    grid.appendChild(
      kpi(
        "Marcos",
        String(
          tarefas.filter(function (t) {
            return t.marco;
          }).length
        ),
        "marcos críticos"
      )
    );
    body.appendChild(grid);

    s.appendChild(body);
    s.appendChild(slideFoot(num, total));
    return s;
  }

  /* ---- 8. Metas & KPIs ---- */
  function slideMetas(num, total) {
    var R = calc();
    var metas = getMetas();

    var s = el("section", "apr-slide");
    s.appendChild(slideHead("Metas & KPIs", "Indicadores do evento e grau de atingimento"));

    var body = el("div", "apr-slide__body");

    if (!metas.length) {
      body.appendChild(el("p", "apr-empty", "Nenhuma meta cadastrada."));
    } else {
      var lista = el("div", "apr-metas");
      metas.forEach(function (m) {
        var atual = Number(m.atual) || 0;
        var alvo = Number(m.alvo) || 0;
        var p = alvo > 0 ? (atual / alvo) * 100 : 0;

        var row = el("div", "apr-meta");

        var top = el("div", "apr-meta__top");
        top.appendChild(el("strong", "apr-meta__nome", m.nome || "—"));
        top.appendChild(
          el(
            "span",
            "apr-meta__val",
            R.formatMetaValor(m, atual) + " de " + R.formatMetaValor(m, alvo)
          )
        );
        row.appendChild(top);

        var track = el("div", "apr-prog__track");
        var fill = el(
          "span",
          "apr-prog__fill " + (p >= 100 ? "apr-c-verde" : p >= 60 ? "apr-c-azul" : "apr-c-laranja")
        );
        fill.style.width = Math.max(0, Math.min(100, p)).toFixed(1) + "%";
        track.appendChild(fill);
        row.appendChild(track);

        row.appendChild(el("span", "apr-meta__pct", Math.round(p) + "% atingido"));

        lista.appendChild(row);
      });
      body.appendChild(lista);
    }

    s.appendChild(body);
    s.appendChild(slideFoot(num, total));
    return s;
  }

  /* ---- 9. Conformidade ---- */
  function slideConformidade(num, total) {
    var R = calc();
    var comp = R.computeCompliance(getFinanceiro(), getContratacoes());

    var s = el("section", "apr-slide");
    s.appendChild(
      slideHead("Conformidade", "Verificações de governança sobre contratos e despesas")
    );

    var body = el("div", "apr-slide__body");

    var score = el(
      "div",
      "apr-score" + (comp.okCount === comp.total ? " is-full" : "")
    );
    score.appendChild(el("span", "apr-score__num", comp.okCount + " / " + comp.total));
    score.appendChild(
      el("span", "apr-score__lab", "verificações em conformidade · " + comp.score + "%")
    );
    body.appendChild(score);

    var grid = el("div", "apr-comp-grid");
    comp.checks.forEach(function (c) {
      var ok = !!c.ok;
      var card = el("div", "apr-comp" + (ok ? " is-ok" : " is-warn"));

      var head = el("div", "apr-comp__head");
      head.appendChild(el("span", "apr-comp__icon", ok ? "✓" : "⚠"));
      head.appendChild(el("span", "apr-comp__titulo", c.titulo));
      card.appendChild(head);

      card.appendChild(
        el(
          "span",
          "apr-comp__status",
          ok
            ? "OK"
            : c.itens.length + (c.itens.length === 1 ? " pendência" : " pendências")
        )
      );

      // No slide mostramos só as 3 primeiras pendências (espaço).
      if (!ok && c.itens.length) {
        var ul = el("ul", "apr-comp__list");
        c.itens.slice(0, 3).forEach(function (linha) {
          ul.appendChild(el("li", null, linha));
        });
        if (c.itens.length > 3) {
          ul.appendChild(
            el("li", "apr-comp__mais", "+ " + (c.itens.length - 3) + " outras")
          );
        }
        card.appendChild(ul);
      }

      grid.appendChild(card);
    });
    body.appendChild(grid);

    s.appendChild(body);
    s.appendChild(slideFoot(num, total));
    return s;
  }

  /* ---- 10. Próximos passos ---- */
  function slideProximosPassos(num, total) {
    var R = calc();
    var s = el("section", "apr-slide");
    s.appendChild(
      slideHead("Próximos passos", "Compromissos assumidos para o próximo ciclo")
    );

    var body = el("div", "apr-slide__body");

    body.appendChild(
      campoNota(
        "proximos",
        "Ações acordadas",
        "Um item por linha. Ex.: fechar contrato de audiovisual até 30/09.",
        true
      )
    );

    // Lembretes de processo — mesma lista da aba Relatórios.
    var lembretes = (R && R.COMPLIANCE_LEMBRETES) || [];
    if (lembretes.length) {
      var box = el("div", "apr-lembretes");
      box.appendChild(el("h4", "apr-bloco__titulo", "Lembretes de processo"));
      var ul = el("ul", "apr-lembretes__list");
      lembretes.forEach(function (txt) {
        ul.appendChild(el("li", null, txt));
      });
      box.appendChild(ul);
      body.appendChild(box);
    }

    s.appendChild(body);
    s.appendChild(slideFoot(num, total));
    return s;
  }

  /* ============================================================
     Montagem do deck
     ============================================================ */
  var BUILDERS = [
    slideCapa,
    slideResumo,
    slideReceitas,
    slideDespesas,
    slideContratacoes,
    slidePatrocinio,
    slideCronograma,
    slideMetas,
    slideConformidade,
    slideProximosPassos
  ];

  var _state = { atual: 0 };
  var _mount = null;

  // Mostra só o slide corrente na tela (a impressão ignora isto).
  function applySelection(slides, contador, btnPrev, btnNext) {
    if (_state.atual < 0) _state.atual = 0;
    if (_state.atual > slides.length - 1) _state.atual = slides.length - 1;

    slides.forEach(function (s, i) {
      var ativo = i === _state.atual;
      s.classList.toggle("is-ativo", ativo);
      s.setAttribute("aria-hidden", ativo ? "false" : "true");
    });

    contador.textContent = _state.atual + 1 + " / " + slides.length;
    btnPrev.disabled = _state.atual === 0;
    btnNext.disabled = _state.atual === slides.length - 1;
  }

  function buildControls(onPrev, onNext, onPrint) {
    var bar = el("div", "apr-controls");

    var nav = el("div", "apr-nav");

    var prev = el("button", "btn sm apr-nav__btn", "◀");
    prev.type = "button";
    prev.title = "Slide anterior";
    prev.setAttribute("aria-label", "Slide anterior");
    prev.addEventListener("click", onPrev);
    nav.appendChild(prev);

    var contador = el("span", "apr-nav__contador", "1 / " + BUILDERS.length);
    contador.setAttribute("aria-live", "polite");
    nav.appendChild(contador);

    var next = el("button", "btn sm apr-nav__btn", "▶");
    next.type = "button";
    next.title = "Próximo slide";
    next.setAttribute("aria-label", "Próximo slide");
    next.addEventListener("click", onNext);
    nav.appendChild(next);

    bar.appendChild(nav);

    // Sem .btn-primary de propósito: o modo somente-leitura do app
    // esconde botões primários, e exportar o deck deve valer para
    // o perfil visualizador também.
    var print = el("button", "btn apr-print", "Imprimir / Salvar PDF");
    print.type = "button";
    print.addEventListener("click", onPrint);
    bar.appendChild(print);

    return { bar: bar, contador: contador, prev: prev, next: next };
  }

  /* ============================================================
     Render principal da aba
     ============================================================ */
  function render() {
    if (!_mount) return;
    clear(_mount);

    var R = calc();

    // Cabeçalho padrão da aba.
    var dias = R ? R.diasParaEvento() : 0;
    var right = window.Gestao.headerStat({
      label: "Contagem regressiva",
      value: dias > 0 ? dias + " dias" : dias === 0 ? "Hoje" : "Encerrado",
      sub: "até 13/11/2026",
      accent: true
    });

    _mount.appendChild(
      window.Gestao.pageHeader({
        eyebrow: "APRESENTAÇÃO · SUMMIT POA PMIRS 2026",
        title: "Apresentação do projeto",
        subtitle: "Deck gerencial montado automaticamente a partir dos dados do sistema",
        right: right
      })
    );

    // Sem o núcleo de cálculo não há deck — avisa em vez de quebrar.
    if (!R) {
      _mount.appendChild(
        el(
          "div",
          "notice error",
          "O módulo de cálculo (js/relatorios.js) não carregou. Recarregue a página."
        )
      );
      return;
    }

    var totalSlides = BUILDERS.length;
    var slides = BUILDERS.map(function (build, i) {
      return build(i + 1, totalSlides);
    });

    var ctl = buildControls(
      function onPrev() {
        _state.atual -= 1;
        applySelection(slides, ctl.contador, ctl.prev, ctl.next);
      },
      function onNext() {
        _state.atual += 1;
        applySelection(slides, ctl.contador, ctl.prev, ctl.next);
      },
      function onPrint() {
        window.print();
      }
    );

    _mount.appendChild(ctl.bar);

    var deck = el("div", "apr-deck");
    slides.forEach(function (s) {
      deck.appendChild(s);
    });
    _mount.appendChild(deck);

    applySelection(slides, ctl.contador, ctl.prev, ctl.next);

    // Navegação por teclado — só quando a aba está ativa e o foco
    // não está num campo de texto (as notas usam as setas).
    if (!_mount._aprKeyHandler) {
      _mount._aprKeyHandler = function (ev) {
        var G = window.Gestao;
        if (!G || G._activeTab !== TAB_ID) return;
        var alvo = ev.target;
        if (alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)) return;

        if (ev.key === "ArrowRight" || ev.key === "PageDown") {
          ev.preventDefault();
          var next = _mount.querySelector(".apr-nav__btn:last-of-type");
          if (next && !next.disabled) next.click();
        } else if (ev.key === "ArrowLeft" || ev.key === "PageUp") {
          ev.preventDefault();
          var prev = _mount.querySelector(".apr-nav__btn");
          if (prev && !prev.disabled) prev.click();
        }
      };
      document.addEventListener("keydown", _mount._aprKeyHandler);
    }
  }

  /* ============================================================
     Registro no app
     ============================================================ */
  function init(mountEl /*, data */) {
    ensureStyles();
    _mount = mountEl;
    render();
  }

  var hasWindow = typeof window !== "undefined";
  if (hasWindow && window.Gestao && typeof window.Gestao.onTab === "function") {
    window.Gestao.onTab(TAB_ID, init);
  } else if (hasWindow && typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
      if (window.Gestao && typeof window.Gestao.onTab === "function") {
        window.Gestao.onTab(TAB_ID, init);
      }
    });
  }

  // Exposto para testes headless (Node não tem window.Gestao real).
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      limitarCategorias: limitarCategorias,
      MAX_BARRAS: MAX_BARRAS,
      SLIDES: BUILDERS.length
    };
  }
})();
