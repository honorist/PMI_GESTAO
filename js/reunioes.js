/* ============================================================
   reunioes.js — Módulo Reuniões (aba "Reuniões")
   ------------------------------------------------------------
   Atas e decisões dos GTs do Summit POA PMIRS 2026.
   - Painel "Ações pendentes": consolida TODAS as ações em aberto
     de todas as reuniões, ordenadas por prazo. Destaca atrasadas
     (prazo < hoje). É o valor principal para o acompanhamento.
     Permite marcar como concluída direto no painel.
   - Lista de reuniões (cards) ordenada por data desc; cada card
     resume participantes/decisões/ações e expande para o detalhe
     completo (pauta, decisões, ações em mini-tabela, ata).
   - CRUD completo via modal (linhas de pauta/decisão/ação
     adicionáveis e removíveis dinamicamente).
   - Tudo persistido via Gestao.save().

   Contrato consumido (window.Gestao):
     Gestao.data.reunioes = { reunioes:[...] }
     Gestao.fmtData(iso) · Gestao.uid(prefix) · Gestao.save()
     Gestao.onTab(id, renderFn) · Gestao.pageHeader · Gestao.headerStat

   Segurança: dados do usuário vão ao DOM via textContent/.value —
   nunca innerHTML com valores.
   ============================================================ */

(function () {
  "use strict";

  var TAB_ID = "tab-reunioes";

  // Status possíveis de uma ação (ordem = ciclo do toggle no painel).
  var ACAO_STATUSES = [
    { id: "pendente", label: "Pendente", badge: "muted" },
    { id: "andamento", label: "Em andamento", badge: "orange" },
    { id: "concluido", label: "Concluído", badge: "green" }
  ];

  /* ============================================================
     Injeção do CSS do módulo
     ============================================================ */
  function ensureStyles() {
    var HREF = "css/reunioes.css";
    var found = false;
    document.querySelectorAll('link[rel="stylesheet"]').forEach(function (l) {
      if (l.getAttribute("href") === HREF) found = true;
    });
    if (found) return;
    var link = document.createElement("link");
    link.id = "reunioes-css";
    link.rel = "stylesheet";
    link.href = HREF;
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

  // Texto seguro com placeholder amigável (em itálico) quando vazio.
  function trimStr(v) {
    return v === null || v === undefined ? "" : String(v).trim();
  }

  /* ============================================================
     Data: helpers de fuso (AAAA-MM-DD tratado como local)
     ============================================================ */

  // 'AAAA-MM-DD' de hoje no fuso local (não usa toISOString p/ evitar UTC).
  function todayISO() {
    var d = new Date();
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }

  // Chave ordenável a partir de 'AAAA-MM-DD' (ou ISO). Sem prazo => Infinity
  // (vai para o fim ao ordenar ascendente).
  function dateKey(iso) {
    var s = trimStr(iso);
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return Number.POSITIVE_INFINITY;
    return Number(m[1] + m[2] + m[3]);
  }

  // true se prazo (AAAA-MM-DD) é estritamente anterior a hoje (local).
  function isAtrasada(prazo) {
    var k = dateKey(prazo);
    if (k === Number.POSITIVE_INFINITY) return false;
    return k < dateKey(todayISO());
  }

  /* ============================================================
     Acesso aos dados (normaliza a estrutura no Gestao.data)
     ============================================================ */
  function getReunioes() {
    var data = (window.Gestao && window.Gestao.data) || {};
    var bloco = data.reunioes || {};
    if (!Array.isArray(bloco.reunioes)) bloco.reunioes = [];
    data.reunioes = bloco;
    if (window.Gestao) window.Gestao.data = data;
    return bloco.reunioes;
  }

  function findReuniao(id) {
    var list = getReunioes();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  // Normaliza uma reunião para garantir que arrays existam (leitura segura).
  function normalizeReuniao(r) {
    r = r || {};
    return {
      id: r.id,
      data: trimStr(r.data),
      titulo: trimStr(r.titulo),
      participantes: Array.isArray(r.participantes) ? r.participantes : [],
      pauta: Array.isArray(r.pauta) ? r.pauta : [],
      decisoes: Array.isArray(r.decisoes) ? r.decisoes : [],
      acoes: Array.isArray(r.acoes) ? r.acoes : [],
      ata: trimStr(r.ata)
    };
  }

  function isStatusValido(s) {
    return ACAO_STATUSES.some(function (x) {
      return x.id === s;
    });
  }

  function statusMeta(s) {
    for (var i = 0; i < ACAO_STATUSES.length; i++) {
      if (ACAO_STATUSES[i].id === s) return ACAO_STATUSES[i];
    }
    return ACAO_STATUSES[0];
  }

  /* ============================================================
     Ações pendentes consolidadas (núcleo do acompanhamento)
     ------------------------------------------------------------
     Varre todas as reuniões, coleta ações com status != concluído
     (pendente/andamento), anota a reunião de origem e o índice da
     ação, e ordena por prazo ascendente (sem prazo vai ao fim).
     ============================================================ */
  function coletarAcoesAbertas(reunioes) {
    var out = [];
    reunioes.forEach(function (raw) {
      var r = normalizeReuniao(raw);
      r.acoes.forEach(function (a, idx) {
        var status = isStatusValido(a && a.status) ? a.status : "pendente";
        if (status === "concluido") return;
        out.push({
          reuniaoId: r.id,
          reuniaoTitulo: r.titulo,
          acaoIndex: idx,
          texto: trimStr(a && a.texto),
          responsavel: trimStr(a && a.responsavel),
          prazo: trimStr(a && a.prazo),
          status: status,
          atrasada: isAtrasada(a && a.prazo)
        });
      });
    });
    out.sort(function (a, b) {
      return dateKey(a.prazo) - dateKey(b.prazo);
    });
    return out;
  }

  /* ============================================================
     Mutações (sempre via cópia + Gestao.save + re-render)
     ============================================================ */
  function upsertReuniao(id, values) {
    var list = getReunioes();
    if (id) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) {
          list[i] = Object.assign({}, list[i], values, { id: id });
          break;
        }
      }
    } else {
      list.push(Object.assign({ id: window.Gestao.uid("re") }, values));
    }
    window.Gestao.save();
    render();
  }

  function removeReuniao(id, titulo) {
    var label = trimStr(titulo) ? '"' + titulo + '"' : "esta reunião";
    if (!window.confirm("Excluir " + label + "?")) return;
    var data = window.Gestao.data;
    data.reunioes.reunioes = getReunioes().filter(function (x) {
      return x.id !== id;
    });
    window.Gestao.save();
    render();
  }

  // Define o status de uma ação específica (por reunião + índice).
  function setAcaoStatus(reuniaoId, acaoIndex, status) {
    if (!isStatusValido(status)) return;
    var list = getReunioes();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id !== reuniaoId) continue;
      var acoes = Array.isArray(list[i].acoes) ? list[i].acoes.slice() : [];
      if (acaoIndex < 0 || acaoIndex >= acoes.length) return;
      acoes[acaoIndex] = Object.assign({}, acoes[acaoIndex], { status: status });
      list[i] = Object.assign({}, list[i], { acoes: acoes });
      break;
    }
    window.Gestao.save();
    render();
  }

  // Avança o status no ciclo pendente -> andamento -> concluído -> pendente.
  function cycleAcaoStatus(reuniaoId, acaoIndex, current) {
    var order = ACAO_STATUSES.map(function (s) {
      return s.id;
    });
    var idx = order.indexOf(isStatusValido(current) ? current : "pendente");
    var next = order[(idx + 1) % order.length];
    setAcaoStatus(reuniaoId, acaoIndex, next);
  }

  /* ============================================================
     UI: painel de Ações pendentes
     ============================================================ */
  function renderPainelAcoes(reunioes) {
    var Gestao = window.Gestao;
    var abertas = coletarAcoesAbertas(reunioes);

    var card = el("div", "card reu-painel");

    var head = el("div", "spread reu-painel-head");
    var titleWrap = el("div", null);
    titleWrap.appendChild(el("h3", "section-title", "Ações pendentes"));
    var nAtrasadas = abertas.filter(function (a) {
      return a.atrasada;
    }).length;
    var subTxt = abertas.length
      ? abertas.length +
        (abertas.length === 1 ? " ação em aberto" : " ações em aberto") +
        (nAtrasadas ? " · " + nAtrasadas + " atrasada" + (nAtrasadas === 1 ? "" : "s") : "")
      : "Tudo em dia.";
    titleWrap.appendChild(el("p", "muted-text reu-painel-sub", subTxt));
    head.appendChild(titleWrap);
    card.appendChild(head);

    if (!abertas.length) {
      card.appendChild(
        el("div", "empty", "Nenhuma ação em aberto. Todas as decisões foram executadas.")
      );
      return card;
    }

    var table = el("table", "table compact reu-acoes-table");
    var thead = el("thead");
    var trh = el("tr");
    ["", "Ação", "Responsável", "Prazo", "Reunião", "Status"].forEach(function (h) {
      trh.appendChild(el("th", null, h));
    });
    thead.appendChild(trh);
    table.appendChild(thead);

    var tbody = el("tbody");
    abertas.forEach(function (a) {
      var tr = el("tr", a.atrasada ? "is-atrasada" : null);

      // Coluna 1: checkbox concluir (toggle direto).
      var tdCheck = el("td", "reu-col-check");
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "reu-check";
      cb.setAttribute(
        "aria-label",
        "Marcar ação como concluída: " + (a.texto || "ação")
      );
      cb.addEventListener("change", function () {
        setAcaoStatus(a.reuniaoId, a.acaoIndex, "concluido");
      });
      tdCheck.appendChild(cb);
      tr.appendChild(tdCheck);

      // Coluna 2: texto da ação.
      var tdTexto = el("td", "reu-col-texto");
      tdTexto.appendChild(el("span", null, a.texto || "(sem descrição)"));
      tr.appendChild(tdTexto);

      // Coluna 3: responsável.
      tr.appendChild(el("td", null, a.responsavel || "—"));

      // Coluna 4: prazo (com marca de atraso).
      var tdPrazo = el("td", "reu-col-prazo");
      if (a.prazo) {
        tdPrazo.appendChild(el("span", null, Gestao.fmtData(a.prazo)));
        if (a.atrasada) tdPrazo.appendChild(el("span", "reu-tag-atraso", "Atrasada"));
      } else {
        tdPrazo.appendChild(el("span", "muted-text", "sem prazo"));
      }
      tr.appendChild(tdPrazo);

      // Coluna 5: reunião de origem.
      tr.appendChild(el("td", "reu-col-origem", a.reuniaoTitulo || "—"));

      // Coluna 6: status (botão que cicla o status).
      var tdStatus = el("td", "reu-col-status");
      tdStatus.appendChild(buildStatusToggle(a.reuniaoId, a.acaoIndex, a.status));
      tr.appendChild(tdStatus);

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    var wrap = el("div", "reu-table-wrap");
    wrap.appendChild(table);
    card.appendChild(wrap);
    return card;
  }

  // Botão-badge que cicla o status (clique avança no ciclo).
  function buildStatusToggle(reuniaoId, acaoIndex, status) {
    var meta = statusMeta(isStatusValido(status) ? status : "pendente");
    var btn = el("button", "badge " + meta.badge + " reu-status-toggle", meta.label);
    btn.type = "button";
    btn.title = "Clique para mudar o status";
    btn.addEventListener("click", function () {
      cycleAcaoStatus(reuniaoId, acaoIndex, status);
    });
    return btn;
  }

  /* ============================================================
     UI: lista de reuniões (cards expansíveis)
     ============================================================ */
  function sortReunioesDesc(reunioes) {
    // Data desc (mais recente primeiro). Sem data => -Infinity para afundar
    // até o fim da lista, em vez de subir ao topo.
    function key(r) {
      var k = dateKey(r && r.data);
      return k === Number.POSITIVE_INFINITY ? Number.NEGATIVE_INFINITY : k;
    }
    return reunioes.slice().sort(function (a, b) {
      return key(b) - key(a);
    });
  }

  function renderListaReunioes(reunioes) {
    var ordered = sortReunioesDesc(reunioes);
    var stack = el("div", "stack reu-lista");
    if (!ordered.length) {
      stack.appendChild(
        el("div", "empty", "Nenhuma reunião registrada. Use “+ Nova reunião”.")
      );
      return stack;
    }
    ordered.forEach(function (raw) {
      stack.appendChild(renderReuniaoCard(raw));
    });
    return stack;
  }

  function renderReuniaoCard(raw) {
    var Gestao = window.Gestao;
    var r = normalizeReuniao(raw);

    var card = el("div", "card reu-card");

    // --- Cabeçalho clicável (resumo) ---
    var header = el("button", "reu-card-head");
    header.type = "button";
    header.setAttribute("aria-expanded", "false");

    var headMain = el("div", "reu-card-headmain");
    var dataLinha = el("div", "reu-card-data", r.data ? Gestao.fmtData(r.data) : "Sem data");
    headMain.appendChild(dataLinha);
    var tituloTxt = r.titulo || "Reunião sem título";
    headMain.appendChild(
      el("div", "reu-card-titulo" + (r.titulo ? "" : " is-vazio"), tituloTxt)
    );
    header.appendChild(headMain);

    // Resumo de contagens (participantes / decisões / ações).
    var nAcoesPend = r.acoes.filter(function (a) {
      var s = isStatusValido(a && a.status) ? a.status : "pendente";
      return s !== "concluido";
    }).length;

    var counts = el("div", "reu-card-counts");
    counts.appendChild(countChip(r.participantes.length, "participante", "participantes"));
    counts.appendChild(countChip(r.decisoes.length, "decisão", "decisões"));
    var acoesChip = countChip(r.acoes.length, "ação", "ações");
    if (nAcoesPend > 0) {
      acoesChip.appendChild(el("span", "reu-count-pend", nAcoesPend + " em aberto"));
    }
    counts.appendChild(acoesChip);
    header.appendChild(counts);

    header.appendChild(el("span", "reu-card-caret", "▾"));
    card.appendChild(header);

    // --- Detalhe (oculto até expandir) ---
    var detail = el("div", "reu-card-detail");
    detail.hidden = true;
    detail.appendChild(renderDetalhe(r));
    card.appendChild(detail);

    header.addEventListener("click", function () {
      var open = detail.hidden;
      detail.hidden = !open;
      header.setAttribute("aria-expanded", open ? "true" : "false");
      card.classList.toggle("is-open", open);
    });

    return card;
  }

  function countChip(n, sing, plur) {
    var chip = el("div", "reu-count");
    chip.appendChild(el("strong", null, String(n)));
    chip.appendChild(document.createTextNode(" " + (n === 1 ? sing : plur)));
    return chip;
  }

  // Bloco de detalhe completo de uma reunião (já normalizada).
  function renderDetalhe(r) {
    var Gestao = window.Gestao;
    var wrap = el("div", "reu-detail-wrap");

    // Participantes (chips).
    var secPart = detailSection("Participantes");
    if (r.participantes.length) {
      var chips = el("div", "reu-chips");
      r.participantes.forEach(function (p) {
        if (trimStr(p)) chips.appendChild(el("span", "chip", trimStr(p)));
      });
      secPart.appendChild(chips);
    } else {
      secPart.appendChild(emptyHint("Sem participantes registrados."));
    }
    wrap.appendChild(secPart);

    // Pauta (lista).
    var secPauta = detailSection("Pauta");
    if (r.pauta.length) {
      var ul = el("ul", "reu-list");
      r.pauta.forEach(function (item) {
        if (trimStr(item)) ul.appendChild(el("li", null, trimStr(item)));
      });
      secPauta.appendChild(ul);
    } else {
      secPauta.appendChild(emptyHint("Sem pauta registrada."));
    }
    wrap.appendChild(secPauta);

    // Decisões (lista com responsável).
    var secDec = detailSection("Decisões");
    if (r.decisoes.length) {
      var ulD = el("ul", "reu-list reu-decisoes");
      r.decisoes.forEach(function (d) {
        var li = el("li", null);
        li.appendChild(el("span", "reu-dec-texto", trimStr(d && d.texto) || "(sem texto)"));
        var resp = trimStr(d && d.responsavel);
        if (resp) li.appendChild(el("span", "reu-dec-resp", resp));
        ulD.appendChild(li);
      });
      secDec.appendChild(ulD);
    } else {
      secDec.appendChild(emptyHint("Sem decisões registradas."));
    }
    wrap.appendChild(secDec);

    // Ações (mini-tabela).
    var secAcoes = detailSection("Ações");
    if (r.acoes.length) {
      secAcoes.appendChild(renderAcoesTabela(r));
    } else {
      secAcoes.appendChild(emptyHint("Sem ações registradas."));
    }
    wrap.appendChild(secAcoes);

    // Ata (texto).
    var secAta = detailSection("Ata");
    if (r.ata) {
      secAta.appendChild(el("p", "reu-ata", r.ata));
    } else {
      secAta.appendChild(emptyHint("Ata não preenchida."));
    }
    wrap.appendChild(secAta);

    // Ações de edição/exclusão da reunião.
    var actions = el("div", "reu-detail-actions");
    var edit = el("button", "btn btn-ghost sm", "Editar");
    edit.type = "button";
    edit.addEventListener("click", function () {
      openForm(r.id);
    });
    actions.appendChild(edit);
    var del = el("button", "btn btn-ghost sm", "Excluir");
    del.type = "button";
    del.addEventListener("click", function () {
      removeReuniao(r.id, r.titulo);
    });
    actions.appendChild(del);
    wrap.appendChild(actions);

    return wrap;
  }

  function detailSection(titulo) {
    var sec = el("div", "reu-detail-sec");
    sec.appendChild(el("h4", "reu-detail-title", titulo));
    return sec;
  }

  function emptyHint(text) {
    return el("p", "reu-empty-hint", text);
  }

  // Mini-tabela de ações dentro do detalhe (texto/responsável/prazo/status).
  function renderAcoesTabela(r) {
    var Gestao = window.Gestao;
    var table = el("table", "table compact reu-acoes-mini");
    var thead = el("thead");
    var trh = el("tr");
    ["Ação", "Responsável", "Prazo", "Status"].forEach(function (h) {
      trh.appendChild(el("th", null, h));
    });
    thead.appendChild(trh);
    table.appendChild(thead);

    var tbody = el("tbody");
    r.acoes.forEach(function (a, idx) {
      var status = isStatusValido(a && a.status) ? a.status : "pendente";
      var atrasada = status !== "concluido" && isAtrasada(a && a.prazo);
      var tr = el("tr", atrasada ? "is-atrasada" : null);

      tr.appendChild(el("td", "reu-col-texto", trimStr(a && a.texto) || "(sem descrição)"));
      tr.appendChild(el("td", null, trimStr(a && a.responsavel) || "—"));

      var tdPrazo = el("td", "reu-col-prazo");
      if (trimStr(a && a.prazo)) {
        tdPrazo.appendChild(el("span", null, Gestao.fmtData(a.prazo)));
        if (atrasada) tdPrazo.appendChild(el("span", "reu-tag-atraso", "Atrasada"));
      } else {
        tdPrazo.appendChild(el("span", "muted-text", "—"));
      }
      tr.appendChild(tdPrazo);

      var tdStatus = el("td", "reu-col-status");
      tdStatus.appendChild(buildStatusToggle(r.id, idx, status));
      tr.appendChild(tdStatus);

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    var wrap = el("div", "reu-table-wrap");
    wrap.appendChild(table);
    return wrap;
  }

  /* ============================================================
     Formulário (modal) — CRUD com linhas dinâmicas
     ============================================================ */
  var _backdrop = null;

  function closeForm() {
    if (_backdrop && _backdrop.parentNode) _backdrop.parentNode.removeChild(_backdrop);
    _backdrop = null;
    document.removeEventListener("keydown", onEscClose);
  }

  function onEscClose(e) {
    if (e.key === "Escape") closeForm();
  }

  function makeInput(type, value) {
    var inp = document.createElement("input");
    inp.type = type;
    if (value !== undefined && value !== null) inp.value = String(value);
    return inp;
  }

  function field(labelText, inputEl, full) {
    var wrap = el("div", "reu-field" + (full ? " full" : ""));
    var id = "reu-f-" + window.Gestao.uid("x");
    var lbl = el("label", null, labelText);
    lbl.setAttribute("for", id);
    inputEl.id = id;
    wrap.appendChild(lbl);
    wrap.appendChild(inputEl);
    return wrap;
  }

  /* ---- Editores de listas dinâmicas (pauta / decisões / ações) ---- */

  // Cria um editor de linhas reutilizável.
  // opts = { titulo, addLabel, items, buildRow(item)->{node, read()} }
  // Retorna { node, read() } onde read() devolve o array de itens lidos.
  function listEditor(opts) {
    var rowsHolder = el("div", "reu-rows");
    var readers = []; // mantém os leitores na ordem visual via nó.

    function addRow(item) {
      var built = opts.buildRow(item || opts.empty());
      var rowWrap = el("div", "reu-row");
      rowWrap.appendChild(built.node);

      var rm = el("button", "reu-row-del", "×");
      rm.type = "button";
      rm.title = "Remover";
      rm.setAttribute("aria-label", "Remover linha");
      rm.addEventListener("click", function () {
        if (rowWrap.parentNode) rowWrap.parentNode.removeChild(rowWrap);
        var i = readers.indexOf(reader);
        if (i !== -1) readers.splice(i, 1);
      });
      rowWrap.appendChild(rm);

      var reader = { node: rowWrap, read: built.read };
      readers.push(reader);
      rowsHolder.appendChild(rowWrap);
      return built;
    }

    (opts.items || []).forEach(function (it) {
      addRow(it);
    });

    var wrap = el("div", "reu-editor full");
    var head = el("div", "reu-editor-head");
    head.appendChild(el("h4", "reu-editor-title", opts.titulo));
    var add = el("button", "btn btn-ghost sm", opts.addLabel);
    add.type = "button";
    add.addEventListener("click", function () {
      var built = addRow(null);
      if (built && built.focus) built.focus();
    });
    head.appendChild(add);
    wrap.appendChild(head);
    wrap.appendChild(rowsHolder);

    return {
      node: wrap,
      read: function () {
        var out = [];
        readers.forEach(function (rd) {
          var v = rd.read();
          if (v !== null && v !== undefined) out.push(v);
        });
        return out;
      }
    };
  }

  // Linha de pauta: 1 input de texto. Lê string (vazias descartadas).
  function buildPautaRow(value) {
    var inp = makeInput("text", value || "");
    inp.placeholder = "Item de pauta";
    inp.className = "reu-row-input";
    return {
      node: inp,
      focus: function () {
        inp.focus();
      },
      read: function () {
        var v = inp.value.trim();
        return v ? v : null;
      }
    };
  }

  // Linha de decisão: texto + responsável.
  function buildDecisaoRow(d) {
    d = d || {};
    var row = el("div", "reu-row-fields");
    var inTexto = makeInput("text", d.texto || "");
    inTexto.placeholder = "Decisão tomada";
    inTexto.className = "reu-row-input grow";
    var inResp = makeInput("text", d.responsavel || "");
    inResp.placeholder = "Responsável";
    inResp.className = "reu-row-input";
    row.appendChild(inTexto);
    row.appendChild(inResp);
    return {
      node: row,
      focus: function () {
        inTexto.focus();
      },
      read: function () {
        var texto = inTexto.value.trim();
        var resp = inResp.value.trim();
        if (!texto && !resp) return null; // linha vazia descartada
        return { texto: texto, responsavel: resp };
      }
    };
  }

  // Linha de ação: texto + responsável + prazo (date) + status (select).
  function buildAcaoRow(a) {
    a = a || {};
    var row = el("div", "reu-row-fields");

    var inTexto = makeInput("text", a.texto || "");
    inTexto.placeholder = "O que será feito";
    inTexto.className = "reu-row-input grow";

    var inResp = makeInput("text", a.responsavel || "");
    inResp.placeholder = "Responsável";
    inResp.className = "reu-row-input";

    var inPrazo = makeInput("date", a.prazo || "");
    inPrazo.className = "reu-row-input reu-row-date";
    inPrazo.setAttribute("aria-label", "Prazo");

    var selStatus = document.createElement("select");
    selStatus.className = "reu-row-input reu-row-status";
    selStatus.setAttribute("aria-label", "Status da ação");
    var current = isStatusValido(a.status) ? a.status : "pendente";
    ACAO_STATUSES.forEach(function (st) {
      var opt = document.createElement("option");
      opt.value = st.id;
      opt.textContent = st.label;
      if (st.id === current) opt.selected = true;
      selStatus.appendChild(opt);
    });

    row.appendChild(inTexto);
    row.appendChild(inResp);
    row.appendChild(inPrazo);
    row.appendChild(selStatus);

    return {
      node: row,
      focus: function () {
        inTexto.focus();
      },
      read: function () {
        var texto = inTexto.value.trim();
        var resp = inResp.value.trim();
        var prazo = inPrazo.value.trim();
        if (!texto && !resp && !prazo) return null; // linha vazia descartada
        return {
          texto: texto,
          responsavel: resp,
          prazo: prazo,
          status: isStatusValido(selStatus.value) ? selStatus.value : "pendente"
        };
      }
    };
  }

  function openForm(id) {
    var existing = id ? normalizeReuniao(findReuniao(id)) : null;
    closeForm();

    _backdrop = el("div", "reu-modal-backdrop");
    _backdrop.addEventListener("click", function (e) {
      if (e.target === _backdrop) closeForm();
    });

    var modal = el("div", "reu-modal");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", existing ? "Editar reunião" : "Nova reunião");
    modal.appendChild(
      el("h3", "section-title", existing ? "Editar reunião" : "Nova reunião")
    );

    var form = document.createElement("form");
    form.className = "reu-form";

    // Data + título.
    var inData = makeInput("date", existing ? existing.data : todayISO());
    form.appendChild(field("Data", inData));

    var inTitulo = makeInput("text", existing ? existing.titulo : "");
    inTitulo.placeholder = "Ex.: Alinhamento quinzenal dos GTs";
    form.appendChild(field("Título", inTitulo, true));

    // Participantes (campo de texto, separados por vírgula).
    var inPart = makeInput(
      "text",
      existing ? existing.participantes.join(", ") : ""
    );
    inPart.placeholder = "Nomes separados por vírgula";
    form.appendChild(field("Participantes", inPart, true));

    // Editores dinâmicos.
    var pautaEd = listEditor({
      titulo: "Pauta",
      addLabel: "+ Item de pauta",
      items: existing ? existing.pauta : [],
      empty: function () {
        return "";
      },
      buildRow: buildPautaRow
    });
    form.appendChild(pautaEd.node);

    var decEd = listEditor({
      titulo: "Decisões",
      addLabel: "+ Decisão",
      items: existing ? existing.decisoes : [],
      empty: function () {
        return {};
      },
      buildRow: buildDecisaoRow
    });
    form.appendChild(decEd.node);

    var acoesEd = listEditor({
      titulo: "Ações",
      addLabel: "+ Ação",
      items: existing ? existing.acoes : [],
      empty: function () {
        return {};
      },
      buildRow: buildAcaoRow
    });
    form.appendChild(acoesEd.node);

    // Ata.
    var taAta = document.createElement("textarea");
    taAta.value = existing ? existing.ata : "";
    taAta.placeholder = "Texto da ata / observações da reunião";
    taAta.rows = 4;
    form.appendChild(field("Ata", taAta, true));

    // Botões.
    var actions = el("div", "reu-form-actions");
    var cancel = el("button", "btn", "Cancelar");
    cancel.type = "button";
    cancel.addEventListener("click", closeForm);
    actions.appendChild(cancel);
    var salvar = el("button", "btn btn-primary", "Salvar");
    salvar.type = "submit";
    actions.appendChild(salvar);
    form.appendChild(actions);

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var participantes = inPart.value
        .split(",")
        .map(function (s) {
          return s.trim();
        })
        .filter(function (s) {
          return s.length > 0;
        });

      var values = {
        data: inData.value.trim(),
        titulo: inTitulo.value.trim(),
        participantes: participantes,
        pauta: pautaEd.read(),
        decisoes: decEd.read(),
        acoes: acoesEd.read(),
        ata: taAta.value.trim()
      };
      upsertReuniao(id, values);
      closeForm();
    });

    modal.appendChild(form);
    _backdrop.appendChild(modal);
    document.body.appendChild(_backdrop);
    document.addEventListener("keydown", onEscClose);
    inTitulo.focus();
  }

  /* ============================================================
     Cabeçalho padrão da aba
     ============================================================ */
  function buildHeader(reunioes) {
    var Gestao = window.Gestao;
    var total = reunioes.length;
    var abertas = coletarAcoesAbertas(reunioes).length;

    var right = Gestao.headerStat({
      label: "Reuniões",
      value: String(total),
      sub: abertas + (abertas === 1 ? " ação aberta" : " ações abertas"),
      accent: true
    });

    return Gestao.pageHeader({
      eyebrow: "REUNIÕES · SUMMIT POA PMIRS 2026",
      title: "Atas e decisões",
      subtitle: "Acompanhamento quinzenal dos GTs",
      right: right
    });
  }

  /* ============================================================
     Render principal
     ============================================================ */
  var _mount = null;

  function render() {
    if (!_mount) return;
    var reunioes = getReunioes();
    clear(_mount);

    _mount.appendChild(buildHeader(reunioes));

    var root = el("div", "stack");

    // Barra de ação (nova reunião).
    var bar = el("div", "spread reu-bar");
    bar.appendChild(
      el("span", "muted-text", "Clique numa reunião para ver pauta, decisões, ações e ata.")
    );
    var addBtn = el("button", "btn btn-primary sm", "+ Nova reunião");
    addBtn.type = "button";
    addBtn.addEventListener("click", function () {
      openForm(null);
    });
    bar.appendChild(addBtn);
    root.appendChild(bar);

    // Painel de ações pendentes (destaque principal).
    root.appendChild(renderPainelAcoes(reunioes));

    // Lista de reuniões.
    root.appendChild(renderListaReunioes(reunioes));

    _mount.appendChild(root);
  }

  /* ============================================================
     Registro no app
     ============================================================ */
  function init(mountEl /*, data */) {
    ensureStyles();
    _mount = mountEl;
    render();
  }

  if (window.Gestao && typeof window.Gestao.onTab === "function") {
    window.Gestao.onTab(TAB_ID, init);
  } else {
    document.addEventListener("DOMContentLoaded", function () {
      if (window.Gestao && typeof window.Gestao.onTab === "function") {
        window.Gestao.onTab(TAB_ID, init);
      }
    });
  }

  // Exposto para testes headless.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      ACAO_STATUSES: ACAO_STATUSES,
      todayISO: todayISO,
      dateKey: dateKey,
      isAtrasada: isAtrasada,
      isStatusValido: isStatusValido,
      statusMeta: statusMeta,
      normalizeReuniao: normalizeReuniao,
      coletarAcoesAbertas: coletarAcoesAbertas,
      sortReunioesDesc: sortReunioesDesc
    };
  }
})();
