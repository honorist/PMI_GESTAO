/* ============================================================
   relatorios.js — Módulo Relatórios (aba "Relatórios")
   ------------------------------------------------------------
   Gera dois relatórios imprimíveis (Export PDF via window.print):
     1) STATUS do projeto  — derivado de cronograma, marcos,
        próximos prazos, ações de reuniões e metas/KPIs.
     2) FINANCEIRO          — derivado de financeiro (receitas e
        despesas, agrupadas por categoria com subtotais).

   É um módulo SÓ-LEITURA: deriva tudo dos dados já carregados
   (não há CRUD nem Gestao.save()).

   Contrato consumido (definido em app.js / window.Gestao):
     Gestao.data = { cronograma, financeiro, contratacoes, eap,
                     canvas, reunioes, equipe, checklist, metas }
     Gestao.fmtBRL(n) · Gestao.fmtData(iso)
     Gestao.onTab(id, renderFn) · Gestao.pageHeader · Gestao.headerStat

   Impressão: o CSS @media print de css/relatorios.css esconde a
   topbar, as abas e os controles, e mostra SOMENTE o .rel-doc
   selecionado (o outro fica com [hidden]).

   Segurança: todo dado entra no DOM via textContent/createElement
   — nunca innerHTML com valores do usuário.
   ============================================================ */

(function () {
  "use strict";

  var TAB_ID = "tab-relatorios";

  /* ---- Constantes do evento ---- */
  var EVENTO_ISO = "2026-11-13"; // 13/11/2026 (1º dia do Summit)
  var EVENTO_LABEL = "Summit POA PMIRS 2026 · Tecnopuc, Porto Alegre · 13–14 nov 2026";
  var LOGO_SRC = "assets/pmirs-horizontal-color.png";
  var LOGO_ALT = "PMI Rio Grande do Sul Chapter";
  var MAX_PROXIMOS = 10; // nº de próximos prazos exibidos

  /* ============================================================
     Injeção do CSS do módulo (sem tocar no index.html)
     ============================================================ */
  function ensureStyles() {
    if (document.getElementById("relatorios-css")) return;
    var link = document.createElement("link");
    link.id = "relatorios-css";
    link.rel = "stylesheet";
    link.href = "css/relatorios.css";
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
     Helpers de número / data (tratando ISO como LOCAL)
     ============================================================ */
  function toNumber(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  function sumBy(items, prop) {
    return (items || []).reduce(function (acc, it) {
      return acc + toNumber(it && it[prop]);
    }, 0);
  }

  // 'AAAA-MM-DD' (ou ISO completo) → Date local (sem deslocamento de fuso).
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

  function hojeISO() {
    var h = hojeLocal();
    return (
      h.getFullYear() +
      "-" +
      String(h.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(h.getDate()).padStart(2, "0")
    );
  }

  // Dias inteiros entre hoje e a data do evento (pode ser negativo).
  function diasParaEvento() {
    var alvo = parseISO(EVENTO_ISO);
    if (!alvo) return 0;
    var diff = alvo.getTime() - hojeLocal().getTime();
    return Math.round(diff / (24 * 60 * 60 * 1000));
  }

  function fmtBRL(n) {
    var G = window.Gestao;
    return G && G.fmtBRL ? G.fmtBRL(n) : "R$ " + toNumber(n).toFixed(2);
  }

  function fmtData(iso) {
    var G = window.Gestao;
    if (G && G.fmtData) return G.fmtData(iso);
    return iso ? String(iso) : "";
  }

  // Percentual já arredondado com vírgula decimal pt-BR.
  function pct(part, total, digits) {
    var p = total > 0 ? (part / total) * 100 : 0;
    return p.toFixed(digits == null ? 0 : digits).replace(".", ",") + "%";
  }

  /* ============================================================
     Acesso aos dados (sempre com fallback seguro)
     ============================================================ */
  function getData() {
    return (window.Gestao && window.Gestao.data) || {};
  }

  function getCronograma() {
    var c = getData().cronograma || {};
    return {
      disciplinas: Array.isArray(c.disciplinas) ? c.disciplinas : [],
      tarefas: Array.isArray(c.tarefas) ? c.tarefas : []
    };
  }

  function getFinanceiro() {
    var f = getData().financeiro || {};
    return {
      receitas: Array.isArray(f.receitas) ? f.receitas : [],
      despesas: Array.isArray(f.despesas) ? f.despesas : []
    };
  }

  function getContratacoes() {
    var c = getData().contratacoes || {};
    return {
      fornecedores: Array.isArray(c.fornecedores) ? c.fornecedores : []
    };
  }

  function getReunioes() {
    var r = getData().reunioes || {};
    return Array.isArray(r.reunioes) ? r.reunioes : [];
  }

  function getMetas() {
    var m = getData().metas || {};
    return Array.isArray(m.metas) ? m.metas : [];
  }

  /* ============================================================
     Blocos reutilizáveis de UI do relatório
     ============================================================ */

  // Cabeçalho do documento (logo do evento + eyebrow/título/meta).
  function docHead(opts) {
    var head = el("header", "rel-doc__head");

    var logo = el("img", "rel-doc__logo");
    logo.src = LOGO_SRC;
    logo.alt = LOGO_ALT;
    head.appendChild(logo);

    var box = el("div", "rel-doc__headtext");
    box.appendChild(el("p", "rel-doc__eyebrow", EVENTO_LABEL));
    box.appendChild(el("h3", "rel-doc__title", opts.title));
    if (opts.meta) box.appendChild(el("p", "rel-doc__meta", opts.meta));
    head.appendChild(box);

    return head;
  }

  // Cartão de estatística do resumo.
  function stat(label, value, sub, variant) {
    var card = el("div", "rel-stat" + (variant ? " " + variant : ""));
    card.appendChild(el("span", "rel-stat__label", label));
    card.appendChild(el("span", "rel-stat__value", value));
    if (sub) card.appendChild(el("span", "rel-stat__sub", sub));
    return card;
  }

  // Seção com título + conteúdo.
  function section(title, contentNode) {
    var sec = el("section", "rel-section");
    sec.appendChild(el("h4", "rel-section__title", title));
    if (contentNode) sec.appendChild(contentNode);
    return sec;
  }

  // Tabela genérica. cols = [{key, label, num, render(row)}], rows = [...]
  // emptyMsg exibido quando rows está vazio.
  function table(cols, rows, emptyMsg) {
    if (!rows.length) {
      return el("p", "rel-empty", emptyMsg || "Sem itens.");
    }
    var wrap = el("div", "rel-table-wrap");
    var t = el("table", "rel-table");

    var thead = el("thead");
    var trh = el("tr");
    cols.forEach(function (c) {
      var th = el("th", c.num ? "num" : null, c.label);
      trh.appendChild(th);
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

  // Barra orçado × realizado (linha rótulo + barra + legenda).
  function barRow(label, realizado, previsto, typeClass) {
    var row = el("div", "rel-bar-row");
    var top = el("div", "rel-bar-top");
    top.appendChild(el("strong", null, label));
    top.appendChild(
      el(
        "span",
        "rel-bar-caption",
        fmtBRL(realizado) + " / " + fmtBRL(previsto)
      )
    );
    row.appendChild(top);

    var p = previsto > 0 ? Math.min(100, (realizado / previsto) * 100) : 0;
    var bar = el("div", "rel-bar " + typeClass);
    var fill = el("span");
    fill.style.width = p.toFixed(1) + "%";
    bar.appendChild(fill);
    row.appendChild(bar);
    return row;
  }

  // Barra horizontal proporcional (rótulo + trilho + valor + %).
  // items = [{ label, valor }]; maxVal define a escala (100%).
  // colorClass aplica a cor de marca via .rel-hbar--<n> (rodízio se omitido).
  function hbarChart(items, maxVal, fixedColorClass) {
    var chart = el("div", "rel-hbar-chart");
    var total = (items || []).reduce(function (a, it) {
      return a + toNumber(it.valor);
    }, 0);
    var max = maxVal != null ? maxVal : Math.max.apply(null, [0].concat(
      (items || []).map(function (it) { return toNumber(it.valor); })
    ));

    (items || []).forEach(function (it, i) {
      var v = toNumber(it.valor);
      var w = max > 0 ? Math.min(100, (v / max) * 100) : 0;
      var colorClass = fixedColorClass || "rel-hbar--c" + (i % 4);

      var row = el("div", "rel-hbar-row");

      var lab = el("span", "rel-hbar-label", it.label);
      row.appendChild(lab);

      var track = el("div", "rel-hbar-track");
      var fill = el("span", "rel-hbar-fill " + colorClass);
      fill.style.width = w.toFixed(1) + "%";
      track.appendChild(fill);
      row.appendChild(track);

      var caption =
        fmtBRL(v) + (total > 0 ? " · " + pct(v, total, 0) : "");
      row.appendChild(el("span", "rel-hbar-val", caption));

      chart.appendChild(row);
    });

    if (!(items || []).length) {
      chart.appendChild(el("p", "rel-empty", "Sem dados para o gráfico."));
    }
    return chart;
  }

  // Gráfico de colunas comparando valores por status do pipeline.
  // cols = [{ label, valor, qtd, colorClass }]
  function pipelineChart(cols) {
    var max = Math.max.apply(null, [0].concat(
      cols.map(function (c) { return toNumber(c.valor); })
    ));
    var chart = el("div", "rel-colchart");
    cols.forEach(function (c) {
      var v = toNumber(c.valor);
      var h = max > 0 ? Math.max(2, (v / max) * 100) : 2;

      var colWrap = el("div", "rel-colchart-col");
      colWrap.appendChild(el("span", "rel-colchart-val", fmtBRL(v)));

      var barArea = el("div", "rel-colchart-bararea");
      var bar = el("span", "rel-colchart-bar " + (c.colorClass || ""));
      bar.style.height = h.toFixed(1) + "%";
      barArea.appendChild(bar);
      colWrap.appendChild(barArea);

      var foot = el("div", "rel-colchart-foot");
      foot.appendChild(el("span", "rel-colchart-label", c.label));
      foot.appendChild(
        el("span", "rel-colchart-qtd", c.qtd + (c.qtd === 1 ? " contrato" : " contratos"))
      );
      colWrap.appendChild(foot);

      chart.appendChild(colWrap);
    });
    return chart;
  }

  // Item de compliance: ✓ OK (verde) ou ⚠ N pendência(s) (laranja) + lista.
  // check = { titulo, descricao, itens: [string], ok: bool }
  function complianceItem(check) {
    var ok = !!check.ok;
    var card = el("div", "rel-comp-item " + (ok ? "is-ok" : "is-warn"));

    var head = el("div", "rel-comp-head");
    head.appendChild(el("span", "rel-comp-icon", ok ? "✓" : "⚠"));

    var txt = el("div", "rel-comp-headtext");
    txt.appendChild(el("span", "rel-comp-titulo", check.titulo));
    var statusLabel = ok
      ? "OK"
      : check.itens.length +
        (check.itens.length === 1 ? " pendência" : " pendências");
    txt.appendChild(el("span", "rel-comp-status", statusLabel));
    head.appendChild(txt);
    card.appendChild(head);

    if (check.descricao) {
      card.appendChild(el("p", "rel-comp-desc", check.descricao));
    }

    if (!ok && check.itens.length) {
      var ul = el("ul", "rel-comp-list");
      check.itens.forEach(function (linha) {
        ul.appendChild(el("li", null, linha));
      });
      card.appendChild(ul);
    }
    return card;
  }

  // Rodapé do documento.
  function docFoot() {
    var foot = el("div", "rel-doc__foot");
    foot.appendChild(el("span", null, EVENTO_LABEL));
    foot.appendChild(el("span", null, "Gerado em " + fmtData(hojeISO())));
    return foot;
  }

  /* ============================================================
     RELATÓRIO 1 — STATUS DO PROJETO
     ============================================================ */
  function buildStatusDoc() {
    var cron = getCronograma();
    var tarefas = cron.tarefas;
    var disciplinas = cron.disciplinas;
    var fin = getFinanceiro();
    var hoje = hojeLocal();

    var doc = el("article", "rel-doc");
    doc.id = "rel-doc-status";
    doc.setAttribute("aria-label", "Relatório de status do projeto");

    var dias = diasParaEvento();
    var metaTxt =
      "Gerado em " +
      fmtData(hojeISO()) +
      " · " +
      (dias > 0
        ? dias + " dias para o evento"
        : dias === 0
        ? "o evento é hoje"
        : "evento há " + Math.abs(dias) + " dias");
    doc.appendChild(docHead({ title: "Relatório de status", meta: metaTxt }));

    /* ---- Resumo ---- */
    var total = tarefas.length;
    var concl = tarefas.filter(function (t) {
      return t.status === "concluido";
    }).length;
    var andamento = tarefas.filter(function (t) {
      return t.status === "andamento";
    }).length;
    var pendente = total - concl - andamento;
    var marcos = tarefas.filter(function (t) {
      return t.marco;
    }).length;
    var saldoReal = sumBy(fin.receitas, "realizado") - sumBy(fin.despesas, "realizado");

    var resumo = el("div", "rel-summary");
    resumo.appendChild(
      stat(
        "Tarefas concluídas",
        pct(concl, total) ,
        concl + " de " + total + " tarefas",
        "is-destaque"
      )
    );
    resumo.appendChild(
      stat(
        "Por status",
        String(total),
        concl + " concl. · " + andamento + " andam. · " + pendente + " pend."
      )
    );
    resumo.appendChild(stat("Marcos", String(marcos), "marcos críticos"));
    resumo.appendChild(
      stat(
        "Saldo financeiro",
        fmtBRL(saldoReal),
        "receita − despesa (realizado)",
        saldoReal >= 0 ? "is-positivo" : "is-negativo"
      )
    );
    doc.appendChild(section("Resumo", resumo));

    /* ---- Avanço por GT (disciplina) ---- */
    var gtRows = disciplinas
      .map(function (d) {
        var doGt = tarefas.filter(function (t) {
          return t.disciplinaId === d.id;
        });
        var c = doGt.filter(function (t) {
          return t.status === "concluido";
        }).length;
        return {
          nome: d.nome || d.id,
          total: doGt.length,
          concl: c,
          p: doGt.length > 0 ? (c / doGt.length) * 100 : 0
        };
      })
      .filter(function (r) {
        return r.total > 0;
      })
      .sort(function (a, b) {
        return b.p - a.p;
      });

    doc.appendChild(
      section(
        "Avanço por GT (disciplina)",
        table(
          [
            { label: "GT", render: function (r) { return r.nome; } },
            {
              label: "Concluídas",
              num: true,
              render: function (r) { return r.concl + " / " + r.total; }
            },
            {
              label: "Avanço",
              num: true,
              render: function (r) {
                return pct(r.concl, r.total);
              }
            },
            {
              label: "",
              render: function (r) {
                var bar = el("div", "rel-gt-bar");
                var fill = el("span");
                fill.style.width = Math.min(100, r.p).toFixed(0) + "%";
                bar.appendChild(fill);
                return bar;
              }
            }
          ],
          gtRows,
          "Nenhuma disciplina com tarefas."
        )
      )
    );

    /* ---- Próximos prazos ---- */
    var nomeDisc = {};
    disciplinas.forEach(function (d) {
      nomeDisc[d.id] = d.nome || d.id;
    });

    var proximos = tarefas
      .filter(function (t) {
        return t.status !== "concluido" && parseISO(t.fim);
      })
      .sort(function (a, b) {
        return parseISO(a.fim).getTime() - parseISO(b.fim).getTime();
      })
      .slice(0, MAX_PROXIMOS);

    doc.appendChild(
      section(
        "Próximos prazos",
        table(
          [
            { label: "Tarefa", render: function (t) { return t.nome || "—"; } },
            {
              label: "GT",
              render: function (t) {
                return nomeDisc[t.disciplinaId] || "—";
              }
            },
            {
              label: "Prazo",
              render: function (t) {
                var fim = parseISO(t.fim);
                var atrasada = fim && fim < hoje;
                var span = el(
                  "span",
                  atrasada ? "rel-late" : null,
                  fmtData(t.fim)
                );
                if (atrasada) {
                  var wrap = el("span");
                  wrap.appendChild(span);
                  wrap.appendChild(el("span", "rel-tag", "atrasada"));
                  return wrap;
                }
                return span;
              }
            },
            {
              label: "Responsável",
              render: function (t) {
                return t.responsavel || "—";
              }
            }
          ],
          proximos,
          "Nenhuma tarefa pendente com prazo definido."
        )
      )
    );

    /* ---- Ações pendentes das reuniões ---- */
    var acoes = [];
    getReunioes().forEach(function (re) {
      (re.acoes || []).forEach(function (a) {
        if (a && a.status !== "concluido") {
          acoes.push({
            texto: a.texto,
            responsavel: a.responsavel,
            prazo: a.prazo,
            origem: re.titulo
          });
        }
      });
    });
    // Ordena por prazo (sem prazo vai para o fim).
    acoes.sort(function (a, b) {
      var da = parseISO(a.prazo);
      var db = parseISO(b.prazo);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da.getTime() - db.getTime();
    });

    doc.appendChild(
      section(
        "Ações pendentes das reuniões",
        table(
          [
            { label: "Ação", render: function (a) { return a.texto || "—"; } },
            {
              label: "Responsável",
              render: function (a) { return a.responsavel || "—"; }
            },
            {
              label: "Prazo",
              render: function (a) {
                if (!a.prazo) return "—";
                var prz = parseISO(a.prazo);
                var atrasada = prz && prz < hoje;
                var span = el(
                  "span",
                  atrasada ? "rel-late" : null,
                  fmtData(a.prazo)
                );
                return span;
              }
            }
          ],
          acoes,
          "Nenhuma ação pendente registrada."
        )
      )
    );

    /* ---- Metas & KPIs ---- */
    var metas = getMetas();
    doc.appendChild(
      section(
        "Metas & KPIs",
        table(
          [
            { label: "Indicador", render: function (m) { return m.nome || "—"; } },
            {
              label: "Atual",
              num: true,
              render: function (m) {
                return formatMetaValor(m, m.atual);
              }
            },
            {
              label: "Alvo",
              num: true,
              render: function (m) {
                return formatMetaValor(m, m.alvo);
              }
            },
            {
              label: "% do alvo",
              num: true,
              render: function (m) {
                return pct(toNumber(m.atual), toNumber(m.alvo), 0);
              }
            }
          ],
          metas,
          "Nenhuma meta cadastrada."
        )
      )
    );

    doc.appendChild(docFoot());
    return doc;
  }

  // Formata o valor de uma meta conforme a unidade (R$ ganha fmtBRL).
  function formatMetaValor(m, valor) {
    var u = (m && m.unidade) || "";
    var n = toNumber(valor);
    if (u === "R$") return fmtBRL(n);
    var numStr = Number.isInteger(n)
      ? String(n)
      : n.toFixed(2).replace(".", ",");
    return u ? numStr + " " + u : numStr;
  }

  /* ============================================================
     RELATÓRIO 2 — FINANCEIRO
     ============================================================ */

  // Agrupa itens por categoria mantendo a ordem de aparição.
  function groupByCategoria(items) {
    var map = {};
    var order = [];
    (items || []).forEach(function (it) {
      var cat = (it && it.categoria) || "Sem categoria";
      if (!map[cat]) {
        map[cat] = [];
        order.push(cat);
      }
      map[cat].push(it);
    });
    return { map: map, order: order };
  }

  /* ------------------------------------------------------------
     Cálculos puros (testáveis sem DOM) do relatório gerencial
     ------------------------------------------------------------ */

  // Rótulos legíveis de status de contratação.
  var STATUS_LABEL = {
    a_contratar: "A contratar",
    negociando: "Em negociação",
    fechado: "Fechado"
  };

  // Uma proposta é considerada anexada quando tem dataUrl (igual à
  // regra usada em contratacoes.js).
  function temProposta(f) {
    return !!(f && f.proposta && f.proposta.dataUrl);
  }

  // Indicadores gerenciais consolidados (números, sem DOM).
  function computeFinanceiro(fin, contr) {
    var receitas = (fin && fin.receitas) || [];
    var despesas = (fin && fin.despesas) || [];
    var fornecedores = (contr && contr.fornecedores) || [];

    var recPrev = sumBy(receitas, "previsto");
    var recReal = sumBy(receitas, "realizado");
    var despPrev = sumBy(despesas, "previsto");
    var despReal = sumBy(despesas, "realizado");

    var fechados = fornecedores.filter(function (f) {
      return f.status === "fechado";
    });
    var negociando = fornecedores.filter(function (f) {
      return f.status === "negociando";
    });
    var comprometido = sumBy(fechados, "valor"); // despesa comprometida
    var emNegociacao = sumBy(negociando, "valor");

    return {
      recPrev: recPrev,
      recReal: recReal,
      despPrev: despPrev,
      despReal: despReal,
      pctReceita: recPrev > 0 ? (recReal / recPrev) * 100 : 0,
      saldoProjetado: recPrev - despPrev,
      saldoRealizado: recReal - despReal,
      comprometido: comprometido,
      emNegociacao: emNegociacao,
      nFechados: fechados.length
    };
  }

  // Pipeline de contratações: quantidade + valor por status.
  function computePipeline(contr) {
    var fornecedores = (contr && contr.fornecedores) || [];
    var ordem = ["a_contratar", "negociando", "fechado"];
    return ordem.map(function (st) {
      var grupo = fornecedores.filter(function (f) {
        return f.status === st;
      });
      return {
        status: st,
        label: STATUS_LABEL[st] || st,
        qtd: grupo.length,
        valor: sumBy(grupo, "valor")
      };
    });
  }

  // Soma de valores por categoria (para gráficos), ordenada desc.
  function computePorCategoria(items, prop) {
    var groups = groupByCategoria(items);
    return groups.order
      .map(function (cat) {
        return { label: cat, valor: sumBy(groups.map[cat], prop || "previsto") };
      })
      .filter(function (r) {
        return r.valor > 0;
      })
      .sort(function (a, b) {
        return b.valor - a.valor;
      });
  }

  // Verificações de conformidade derivadas dos dados.
  // Retorna { checks:[{titulo,descricao,itens,ok}], okCount, total, score }.
  function computeCompliance(fin, contr) {
    var despesas = (fin && fin.despesas) || [];
    var fornecedores = (contr && contr.fornecedores) || [];
    var fechados = fornecedores.filter(function (f) {
      return f.status === "fechado";
    });

    function nomeOuRef(f) {
      return (f.nome && f.nome.trim()) || f.categoria || f.id || "Fornecedor";
    }

    // 1) Contratos fechados SEM proposta anexada.
    var semProposta = fechados
      .filter(function (f) {
        return !temProposta(f);
      })
      .map(function (f) {
        return nomeOuRef(f) + " — " + fmtBRL(f.valor);
      });

    // 2) Fornecedores sem contato cadastrado.
    var semContato = fornecedores
      .filter(function (f) {
        return !(f.contato && String(f.contato).trim());
      })
      .map(nomeOuRef);

    // 3) Despesas sem fornecedor vinculado.
    var despSemForn = despesas
      .filter(function (d) {
        return !(d.fornecedor && String(d.fornecedor).trim());
      })
      .map(function (d) {
        return (d.descricao || d.categoria || "Despesa") + " — " + fmtBRL(d.previsto);
      });

    // 4) Contratos fechados sem GT/disciplina.
    var semGt = fechados
      .filter(function (f) {
        return !(f.disciplinaId && String(f.disciplinaId).trim());
      })
      .map(function (f) {
        return nomeOuRef(f) + " — " + fmtBRL(f.valor);
      });

    var checks = [
      {
        titulo: "Propostas anexadas aos contratos fechados",
        descricao: "Todo contrato fechado deve ter a proposta comercial arquivada (risco documental).",
        itens: semProposta
      },
      {
        titulo: "Contato cadastrado por fornecedor",
        descricao: "Cada fornecedor deve ter um contato para rastreabilidade.",
        itens: semContato
      },
      {
        titulo: "Despesas com fornecedor vinculado",
        descricao: "Despesas devem apontar o fornecedor responsável.",
        itens: despSemForn
      },
      {
        titulo: "GT/disciplina definida nos contratos fechados",
        descricao: "Cada contrato fechado deve estar associado a um GT responsável.",
        itens: semGt
      }
    ].map(function (c) {
      c.ok = c.itens.length === 0;
      return c;
    });

    var okCount = checks.filter(function (c) {
      return c.ok;
    }).length;

    return {
      checks: checks,
      okCount: okCount,
      total: checks.length,
      score: checks.length > 0 ? Math.round((okCount / checks.length) * 100) : 100
    };
  }

  // Lembretes informativos (sempre exibidos como nota de processo).
  var COMPLIANCE_LEMBRETES = [
    "Arquivar os contratos assinados de cada fornecedor.",
    "Manter as notas fiscais organizadas por fornecedor.",
    "Emitir o relatório financeiro final no encerramento do evento."
  ];

  /* ------------------------------------------------------------
     Tabela gerencial de CONTRATOS FECHADOS
     ------------------------------------------------------------ */
  function tabelaContratosFechados(fechados, nomeDisc) {
    if (!fechados.length) {
      return el(
        "p",
        "rel-empty",
        "Nenhum contrato fechado até o momento."
      );
    }

    var wrap = el("div", "rel-table-wrap");
    var t = el("table", "rel-table");

    var thead = el("thead");
    var trh = el("tr");
    trh.appendChild(el("th", null, "Empresa"));
    trh.appendChild(el("th", null, "Serviço"));
    trh.appendChild(el("th", null, "GT"));
    trh.appendChild(el("th", "num", "Valor"));
    trh.appendChild(el("th", null, "Proposta"));
    thead.appendChild(trh);
    t.appendChild(thead);

    var tbody = el("tbody");
    fechados.forEach(function (f) {
      var tr = el("tr");

      // Empresa
      tr.appendChild(el("td", null, (f.nome && f.nome.trim()) || "—"));

      // Serviço (categoria + observação como detalhe)
      var tdServ = el("td");
      tdServ.appendChild(el("span", null, f.categoria || "—"));
      if (f.observacao && String(f.observacao).trim()) {
        tdServ.appendChild(el("span", "rel-cell-sub", f.observacao));
      }
      tr.appendChild(tdServ);

      // GT (disciplina)
      tr.appendChild(el("td", null, nomeDisc[f.disciplinaId] || "—"));

      // Valor
      tr.appendChild(el("td", "num", fmtBRL(f.valor)));

      // Proposta ✓/✗
      var tdProp = el("td");
      if (temProposta(f)) {
        tdProp.appendChild(el("span", "rel-ok", "✓ anexada"));
      } else {
        tdProp.appendChild(el("span", "rel-warn-text", "✗ pendente"));
      }
      tr.appendChild(tdProp);

      tbody.appendChild(tr);
    });

    // Total dos contratos fechados.
    var totTr = el("tr", "rel-total-row");
    totTr.appendChild(el("td", null, "Total contratado (fechados)"));
    totTr.appendChild(el("td", null, ""));
    totTr.appendChild(el("td", null, ""));
    totTr.appendChild(el("td", "num", fmtBRL(sumBy(fechados, "valor"))));
    totTr.appendChild(el("td", null, ""));
    tbody.appendChild(totTr);

    t.appendChild(tbody);
    wrap.appendChild(t);
    return wrap;
  }

  /* ------------------------------------------------------------
     RELATÓRIO FINANCEIRO GERENCIAL (documento)
     ------------------------------------------------------------ */
  function buildFinanceiroDoc() {
    var fin = getFinanceiro();
    var contr = getContratacoes();
    var cron = getCronograma();

    // Mapa disciplinaId -> nome (GT).
    var nomeDisc = {};
    cron.disciplinas.forEach(function (d) {
      nomeDisc[d.id] = d.nome || d.id;
    });

    var k = computeFinanceiro(fin, contr);
    var pipeline = computePipeline(contr);
    var fechados = contr.fornecedores.filter(function (f) {
      return f.status === "fechado";
    });

    var doc = el("article", "rel-doc rel-doc--gerencial");
    doc.id = "rel-doc-financeiro";
    doc.setAttribute("aria-label", "Relatório gerencial financeiro");

    doc.appendChild(
      docHead({
        title: "Relatório Gerencial Financeiro",
        meta: "Gerado em " + fmtData(hojeISO())
      })
    );

    /* ---- 1. Sumário executivo ---- */
    var resumo = el("div", "rel-summary");
    resumo.appendChild(
      stat(
        "Receita prevista",
        fmtBRL(k.recPrev),
        "potencial de arrecadação",
        "is-destaque"
      )
    );
    resumo.appendChild(
      stat(
        "Receita realizada",
        fmtBRL(k.recReal),
        pct(k.recReal, k.recPrev, 1) + " executado",
        "is-positivo"
      )
    );
    resumo.appendChild(
      stat(
        "Despesa prevista",
        fmtBRL(k.despPrev),
        "orçamento planejado"
      )
    );
    resumo.appendChild(
      stat(
        "Despesa comprometida",
        fmtBRL(k.comprometido),
        "contratos fechados · realizado: " + fmtBRL(k.despReal),
        "is-negativo"
      )
    );
    resumo.appendChild(
      stat(
        "Saldo projetado",
        fmtBRL(k.saldoProjetado),
        "receita prev. − despesa prev.",
        k.saldoProjetado >= 0 ? "is-positivo" : "is-negativo"
      )
    );
    resumo.appendChild(
      stat(
        "Saldo realizado",
        fmtBRL(k.saldoRealizado),
        "receita real. − despesa real.",
        k.saldoRealizado >= 0 ? "is-positivo" : "is-negativo"
      )
    );
    resumo.appendChild(
      stat(
        "Total contratado",
        fmtBRL(k.comprometido),
        k.nFechados + (k.nFechados === 1 ? " contrato fechado" : " contratos fechados")
      )
    );
    resumo.appendChild(
      stat(
        "Em negociação",
        fmtBRL(k.emNegociacao),
        "valor em pipeline"
      )
    );
    doc.appendChild(section("Sumário executivo", resumo));

    /* ---- 2. Contratos fechados ---- */
    doc.appendChild(
      section("Contratos fechados", tabelaContratosFechados(fechados, nomeDisc))
    );

    /* ---- 3. Pipeline de contratações (gráfico + números) ---- */
    var pipeWrap = el("div", "rel-pipeline");

    var pipeCols = [
      { label: "A contratar", valor: pipeline[0].valor, qtd: pipeline[0].qtd, colorClass: "rel-col--azul" },
      { label: "Em negociação", valor: pipeline[1].valor, qtd: pipeline[1].qtd, colorClass: "rel-col--laranja" },
      { label: "Fechado", valor: pipeline[2].valor, qtd: pipeline[2].qtd, colorClass: "rel-col--verde" }
    ];
    pipeWrap.appendChild(pipelineChart(pipeCols));

    // Tabela-resumo do pipeline (quantidade + valor por status).
    pipeWrap.appendChild(
      table(
        [
          { label: "Status", render: function (r) { return r.label; } },
          { label: "Qtd.", num: true, render: function (r) { return String(r.qtd); } },
          { label: "Valor", num: true, render: function (r) { return fmtBRL(r.valor); } }
        ],
        pipeline,
        "Nenhuma contratação cadastrada."
      )
    );
    doc.appendChild(section("Pipeline de contratações", pipeWrap));

    /* ---- 4. Gráficos de alto nível ---- */
    var despCats = computePorCategoria(fin.despesas, "previsto");
    var recCats = computePorCategoria(fin.receitas, "previsto");

    var graf = el("div", "rel-graf-stack");

    // 4a. Despesas por categoria
    var bloco1 = el("div", "rel-graf-bloco");
    bloco1.appendChild(el("h5", "rel-graf-titulo", "Despesas por categoria (previsto)"));
    bloco1.appendChild(hbarChart(despCats, null));
    graf.appendChild(bloco1);

    // 4b. Receitas por categoria/lote
    var bloco2 = el("div", "rel-graf-bloco");
    bloco2.appendChild(el("h5", "rel-graf-titulo", "Receitas por categoria (previsto)"));
    bloco2.appendChild(hbarChart(recCats, null, "rel-hbar--verde"));
    graf.appendChild(bloco2);

    // 4c. Orçado × realizado (receita e despesa)
    var bloco3 = el("div", "rel-graf-bloco");
    bloco3.appendChild(el("h5", "rel-graf-titulo", "Orçado × realizado"));
    var bars = el("div");
    bars.appendChild(barRow("Receitas", k.recReal, k.recPrev, "t-receita"));
    bars.appendChild(barRow("Despesas", k.despReal, k.despPrev, "t-despesa"));
    bloco3.appendChild(bars);
    graf.appendChild(bloco3);

    doc.appendChild(section("Gráficos de alto nível", graf));

    /* ---- 5. Compliance / Conformidade ---- */
    var comp = computeCompliance(fin, contr);
    var compWrap = el("div", "rel-compliance");

    var scoreBox = el("div", "rel-comp-score" + (comp.okCount === comp.total ? " is-full" : ""));
    scoreBox.appendChild(el("span", "rel-comp-score-num", comp.okCount + " / " + comp.total));
    scoreBox.appendChild(el("span", "rel-comp-score-lab", "verificações em conformidade · " + comp.score + "%"));
    compWrap.appendChild(scoreBox);

    var grid = el("div", "rel-comp-grid");
    comp.checks.forEach(function (c) {
      grid.appendChild(complianceItem(c));
    });
    compWrap.appendChild(grid);

    // Lembretes informativos de processo.
    var lembrBox = el("div", "rel-comp-lembretes");
    lembrBox.appendChild(el("span", "rel-comp-lembretes-titulo", "Lembretes de processo"));
    var ul = el("ul", "rel-comp-list");
    COMPLIANCE_LEMBRETES.forEach(function (txt) {
      ul.appendChild(el("li", null, txt));
    });
    lembrBox.appendChild(ul);
    compWrap.appendChild(lembrBox);

    doc.appendChild(section("Compliance / Conformidade", compWrap));

    doc.appendChild(docFoot());
    return doc;
  }

  /* ============================================================
     Controles (seletor de relatório + imprimir)
     ============================================================ */
  var _state = { atual: "status" }; // "status" | "financeiro"

  function buildControls(onSelect, onPrint) {
    var bar = el("div", "rel-controls");

    var sw = el("div", "rel-switch");
    sw.setAttribute("role", "tablist");
    sw.setAttribute("aria-label", "Escolha o relatório");

    function mkBtn(id, label) {
      var b = el("button", "rel-switch__btn", label);
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("data-rel", id);
      b.setAttribute(
        "aria-selected",
        _state.atual === id ? "true" : "false"
      );
      b.addEventListener("click", function () {
        onSelect(id);
      });
      return b;
    }

    sw.appendChild(mkBtn("status", "Status do projeto"));
    sw.appendChild(mkBtn("financeiro", "Financeiro"));
    bar.appendChild(sw);

    var print = el("button", "btn btn-primary", "Imprimir / Salvar PDF");
    print.type = "button";
    print.addEventListener("click", onPrint);
    bar.appendChild(print);

    return bar;
  }

  /* ============================================================
     Render principal da aba
     ============================================================ */
  var _mount = null;

  // Reflete o relatório selecionado: mostra um .rel-doc, esconde o outro,
  // e atualiza o estado [aria-selected] dos botões do seletor.
  function applySelection(statusDoc, finDoc, controls) {
    var isStatus = _state.atual === "status";
    statusDoc.hidden = !isStatus;
    finDoc.hidden = isStatus;

    var btns = controls.querySelectorAll(".rel-switch__btn");
    btns.forEach(function (b) {
      var sel = b.getAttribute("data-rel") === _state.atual;
      b.setAttribute("aria-selected", sel ? "true" : "false");
    });
  }

  function render() {
    if (!_mount) return;
    clear(_mount);

    // Cabeçalho padrão da aba (estilo Cronograma) com 1 botão à direita.
    var dias = diasParaEvento();
    var right = window.Gestao.headerStat({
      label: "Contagem regressiva",
      value: dias > 0 ? dias + " dias" : dias === 0 ? "Hoje" : "Encerrado",
      sub: "até 13/11/2026",
      accent: true
    });

    _mount.appendChild(
      window.Gestao.pageHeader({
        eyebrow: "RELATÓRIOS · SUMMIT POA PMIRS 2026",
        title: "Relatórios do projeto",
        subtitle: "Gere relatórios imprimíveis (PDF) para as reuniões",
        right: right
      })
    );

    // Documentos (construídos uma vez por render).
    var statusDoc = buildStatusDoc();
    var finDoc = buildFinanceiroDoc();

    // Controles (seletor + imprimir).
    var controls = buildControls(
      function onSelect(id) {
        _state.atual = id;
        applySelection(statusDoc, finDoc, controls);
      },
      function onPrint() {
        window.print();
      }
    );

    _mount.appendChild(controls);
    _mount.appendChild(statusDoc);
    _mount.appendChild(finDoc);

    applySelection(statusDoc, finDoc, controls);
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
      toNumber: toNumber,
      sumBy: sumBy,
      parseISO: parseISO,
      diasParaEvento: diasParaEvento,
      pct: pct,
      groupByCategoria: groupByCategoria,
      formatMetaValor: formatMetaValor,
      temProposta: temProposta,
      computeFinanceiro: computeFinanceiro,
      computePipeline: computePipeline,
      computePorCategoria: computePorCategoria,
      computeCompliance: computeCompliance
    };
  }
})();
