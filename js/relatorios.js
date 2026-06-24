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

  // Tabela financeira agrupada por categoria, com subtotais e total.
  // kind = "receita" | "despesa" (despesa adiciona coluna Fornecedor).
  function tabelaFinanceira(items, kind) {
    var isDesp = kind === "despesa";

    // Colunas: Descrição | Previsto | Realizado [| Fornecedor]
    var nCols = isDesp ? 4 : 3;

    if (!items.length) {
      return el(
        "p",
        "rel-empty",
        isDesp ? "Nenhuma despesa cadastrada." : "Nenhuma receita cadastrada."
      );
    }

    var wrap = el("div", "rel-table-wrap");
    var t = el("table", "rel-table");

    var thead = el("thead");
    var trh = el("tr");
    trh.appendChild(el("th", null, "Descrição"));
    trh.appendChild(el("th", "num", "Previsto"));
    trh.appendChild(el("th", "num", "Realizado"));
    if (isDesp) trh.appendChild(el("th", null, "Fornecedor"));
    thead.appendChild(trh);
    t.appendChild(thead);

    var tbody = el("tbody");
    var groups = groupByCategoria(items);

    groups.order.forEach(function (cat) {
      var rows = groups.map[cat];

      // Cabeçalho do grupo.
      var gTr = el("tr", "rel-group-row");
      var gTd = el("td", null, cat);
      gTd.colSpan = nCols;
      gTr.appendChild(gTd);
      tbody.appendChild(gTr);

      // Itens.
      rows.forEach(function (it) {
        var tr = el("tr");
        tr.appendChild(el("td", null, it.descricao || "—"));
        tr.appendChild(el("td", "num", fmtBRL(it.previsto)));
        tr.appendChild(el("td", "num", fmtBRL(it.realizado)));
        if (isDesp) tr.appendChild(el("td", null, it.fornecedor || "—"));
        tbody.appendChild(tr);
      });

      // Subtotal do grupo.
      var sTr = el("tr", "rel-subtotal-row");
      sTr.appendChild(el("td", null, "Subtotal · " + cat));
      sTr.appendChild(el("td", "num", fmtBRL(sumBy(rows, "previsto"))));
      sTr.appendChild(el("td", "num", fmtBRL(sumBy(rows, "realizado"))));
      if (isDesp) sTr.appendChild(el("td", null, ""));
      tbody.appendChild(sTr);
    });

    // Total geral.
    var totTr = el("tr", "rel-total-row");
    totTr.appendChild(el("td", null, "Total geral"));
    totTr.appendChild(el("td", "num", fmtBRL(sumBy(items, "previsto"))));
    totTr.appendChild(el("td", "num", fmtBRL(sumBy(items, "realizado"))));
    if (isDesp) totTr.appendChild(el("td", null, ""));
    tbody.appendChild(totTr);

    t.appendChild(tbody);
    wrap.appendChild(t);
    return wrap;
  }

  function buildFinanceiroDoc() {
    var fin = getFinanceiro();

    var recPrev = sumBy(fin.receitas, "previsto");
    var recReal = sumBy(fin.receitas, "realizado");
    var despPrev = sumBy(fin.despesas, "previsto");
    var despReal = sumBy(fin.despesas, "realizado");
    var saldo = recReal - despReal;

    var doc = el("article", "rel-doc");
    doc.id = "rel-doc-financeiro";
    doc.setAttribute("aria-label", "Relatório financeiro");

    doc.appendChild(
      docHead({
        title: "Relatório financeiro",
        meta: "Gerado em " + fmtData(hojeISO())
      })
    );

    /* ---- Resumo ---- */
    var resumo = el("div", "rel-summary");
    resumo.appendChild(
      stat(
        "Receitas",
        fmtBRL(recReal),
        "previsto: " + fmtBRL(recPrev),
        "is-positivo"
      )
    );
    resumo.appendChild(
      stat(
        "Despesas",
        fmtBRL(despReal),
        "previsto: " + fmtBRL(despPrev),
        "is-negativo"
      )
    );
    resumo.appendChild(
      stat(
        "Saldo realizado",
        fmtBRL(saldo),
        "receita − despesa",
        saldo >= 0 ? "is-positivo" : "is-negativo"
      )
    );
    resumo.appendChild(
      stat(
        "% receita realizada",
        pct(recReal, recPrev, 1),
        fmtBRL(recReal) + " de " + fmtBRL(recPrev),
        "is-destaque"
      )
    );
    doc.appendChild(section("Resumo", resumo));

    /* ---- Receitas ---- */
    doc.appendChild(section("Receitas", tabelaFinanceira(fin.receitas, "receita")));

    /* ---- Despesas ---- */
    doc.appendChild(section("Despesas", tabelaFinanceira(fin.despesas, "despesa")));

    /* ---- Orçado × realizado ---- */
    var bars = el("div");
    bars.appendChild(barRow("Receitas", recReal, recPrev, "t-receita"));
    bars.appendChild(barRow("Despesas", despReal, despPrev, "t-despesa"));
    doc.appendChild(section("Orçado × realizado", bars));

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
      formatMetaValor: formatMetaValor
    };
  }
})();
