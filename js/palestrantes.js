/* ============================================================
   palestrantes.js — Aba "Palestrantes" do app de gestão
   ------------------------------------------------------------
   Exibe os 2 palcos (South Summit e HP) com a lista de sessões.
   Cada sessão tem uma lista de palestrantes (painéis de debate têm
   vários), editável em modo master. Sessões sem palestrante
   aparecem como "(a definir)".

   Dados em: Gestao.data.palestrantes.palcos (array de palcos).
   Salva via Gestao.save() após cada edição.

   Registra-se via Gestao.onTab('tab-palestrantes', render).
   ============================================================ */

(function () {
  "use strict";

  var FONTS_HREF =
    "https://fonts.googleapis.com/css2?" +
    "family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&" +
    "family=Manrope:wght@400;500;600;700&display=swap";

  /* ---- Status de confirmação da sessão ---- */
  var STATUS = {
    a_definir: { label: "A definir" },
    convidado: { label: "Convidado" },
    confirmado: { label: "Confirmado" }
  };
  var STATUS_ORDER = ["a_definir", "convidado", "confirmado"];

  /* ---- Dados padrão dos palcos (usados quando o banco não tem ainda) ---- */
  var PALCOS_DEFAULT = [
    {
      id: "principal", nome: "Palco South Summit",
      sessoes: [
        { id: "kn1", horario: "08h30 - 09h30", titulo: "Keynote 1",            tipo: "keynote",  palestrante: "",               empresa: "", tema: "" },
        { id: "a1",  horario: "10h00 - 11h00", titulo: "Sessão paralela A1",   tipo: "sessao",   palestrante: "",               empresa: "", tema: "" },
        { id: "a2",  horario: "11h00 - 12h00", titulo: "Sessão paralela A2",   tipo: "sessao",   palestrante: "",               empresa: "", tema: "" },
        { id: "kn2", horario: "13h30 - 14h30", titulo: "Keynote 2",            tipo: "keynote",  palestrante: "",               empresa: "", tema: "" },
        { id: "a3",  horario: "14h30 - 15h30", titulo: "Sessão paralela A3",   tipo: "sessao",   palestrante: "",               empresa: "", tema: "" },
        { id: "a4",  horario: "16h00 - 17h00", titulo: "Sessão paralela A4",   tipo: "sessao",   palestrante: "",               empresa: "", tema: "" },
        { id: "kn3", horario: "17h00 - 18h00", titulo: "Keynote 3",            tipo: "keynote",  palestrante: "Gino Terentim",  empresa: "PMI", tema: "" }
      ]
    },
    {
      id: "secundario", nome: "Palco HP",
      sessoes: [
        { id: "proj1", horario: "10h00 - 10h20", titulo: "Melhores do Ano – Projeto · Apresentação 1", tipo: "especial", palestrante: "", empresa: "", tema: "" },
        { id: "proj2", horario: "10h20 - 10h40", titulo: "Melhores do Ano – Projeto · Apresentação 2", tipo: "especial", palestrante: "", empresa: "", tema: "" },
        { id: "proj3", horario: "10h40 - 11h00", titulo: "Melhores do Ano – Projeto · Apresentação 3", tipo: "especial", palestrante: "", empresa: "", tema: "" },
        { id: "b2",    horario: "11h00 - 12h00", titulo: "Sessão paralela B2",                          tipo: "sessao",   palestrante: "", empresa: "", tema: "" },
        { id: "pmo1",  horario: "14h30 - 14h50", titulo: "Melhores do Ano – PMO · Apresentação 1",     tipo: "especial", palestrante: "", empresa: "", tema: "" },
        { id: "pmo2",  horario: "14h50 - 15h10", titulo: "Melhores do Ano – PMO · Apresentação 2",     tipo: "especial", palestrante: "", empresa: "", tema: "" },
        { id: "pmo3",  horario: "15h10 - 15h30", titulo: "Melhores do Ano – PMO · Apresentação 3",     tipo: "especial", palestrante: "", empresa: "", tema: "" },
        { id: "b4",    horario: "16h00 - 17h00", titulo: "Sessão paralela B4",                          tipo: "sessao",   palestrante: "", empresa: "", tema: "" },
        { id: "prem",  horario: "17h00 - 18h00", titulo: "Premiação",                                   tipo: "especial", palestrante: "", empresa: "", tema: "" }
      ]
    }
  ];

  /* ---- Lista de palestrantes da sessão (aceita o formato legado de um
     palestrante só em campos soltos: palestrante/empresa/linkedin/...) ---- */
  function palestrantesDaSessao(s) {
    if (Array.isArray(s.palestrantes)) return s.palestrantes;
    var nome = (s.palestrante || "").trim();
    if (!nome) return [];
    return [{
      nome: nome,
      empresa: s.empresa || "",
      linkedin: s.linkedin || "",
      fotoDataUrl: s.fotoDataUrl || "",
      bio: s.bio || ""
    }];
  }

  var CAMPOS_LEGADOS = ["palestrante", "empresa", "linkedin", "fotoDataUrl", "bio"];

  /* ---- Migração: campos soltos de um palestrante viram o array
     `palestrantes` (sessões de painel têm várias pessoas) ---- */
  function migrarListaPalestrantes(palcos) {
    var mudou = false;
    palcos.forEach(function (p) {
      (p.sessoes || []).forEach(function (s) {
        if (Array.isArray(s.palestrantes)) return;
        s.palestrantes = palestrantesDaSessao(s);
        CAMPOS_LEGADOS.forEach(function (c) { delete s[c]; });
        mudou = true;
      });
    });
    return mudou;
  }

  /* ---- Migração: expande b1/b3 legados para 3 slots de 20 min ---- */
  function migrarMelhoresDoAno(palcos) {
    var mudou = false;
    for (var i = 0; i < palcos.length; i++) {
      var palco = palcos[i];
      if (palco.id !== "secundario") continue;
      var antigas = palco.sessoes || [];
      var novas = [];
      for (var j = 0; j < antigas.length; j++) {
        var s = antigas[j];
        if (s.id === "b1") {
          novas.push({ id:"proj1", horario:"10h00 - 10h20", titulo:"Melhores do Ano – Projeto · Apresentação 1", tipo:"especial", palestrante:"", empresa:"", tema:"" });
          novas.push({ id:"proj2", horario:"10h20 - 10h40", titulo:"Melhores do Ano – Projeto · Apresentação 2", tipo:"especial", palestrante:"", empresa:"", tema:"" });
          novas.push({ id:"proj3", horario:"10h40 - 11h00", titulo:"Melhores do Ano – Projeto · Apresentação 3", tipo:"especial", palestrante:"", empresa:"", tema:"" });
          mudou = true;
        } else if (s.id === "b3") {
          novas.push({ id:"pmo1", horario:"14h30 - 14h50", titulo:"Melhores do Ano – PMO · Apresentação 1", tipo:"especial", palestrante:"", empresa:"", tema:"" });
          novas.push({ id:"pmo2", horario:"14h50 - 15h10", titulo:"Melhores do Ano – PMO · Apresentação 2", tipo:"especial", palestrante:"", empresa:"", tema:"" });
          novas.push({ id:"pmo3", horario:"15h10 - 15h30", titulo:"Melhores do Ano – PMO · Apresentação 3", tipo:"especial", palestrante:"", empresa:"", tema:"" });
          mudou = true;
        } else {
          novas.push(s);
        }
      }
      palco.sessoes = novas;
    }
    return mudou;
  }

  /* ---- Migração: remove o palco "Palco 3" (id gp_elas, antigo "GP com Elas") ---- */
  function migrarRemovePalcoGpElas(palcos) {
    var mudou = false;
    for (var i = palcos.length - 1; i >= 0; i--) {
      if (palcos[i].id === "gp_elas") { palcos.splice(i, 1); mudou = true; }
    }
    return mudou;
  }

  /* ---- Migração: nomes dos palcos iguais ao site do evento ---- */
  var NOMES_PALCOS = { principal: "Palco South Summit", secundario: "Palco HP" };
  function migrarNomesPalcos(palcos) {
    var mudou = false;
    palcos.forEach(function (p) {
      var nome = NOMES_PALCOS[p.id];
      if (nome && p.nome !== nome) { p.nome = nome; mudou = true; }
    });
    return mudou;
  }

  /* ---- Cor de cada palco (data-cor do card; estilos em palestrantes.css) ---- */
  var CORES_PALCOS = { principal: "roxo", secundario: "petroleo" };

  /* ---- Migração: dá um status explícito a sessões que não têm ---- */
  function migrarStatus(palcos) {
    var mudou = false;
    for (var i = 0; i < palcos.length; i++) {
      var sessoes = palcos[i].sessoes || [];
      for (var j = 0; j < sessoes.length; j++) {
        var s = sessoes[j];
        if (!s.status || !STATUS[s.status]) {
          s.status = palestrantesDaSessao(s).length ? "confirmado" : "a_definir";
          mudou = true;
        }
      }
    }
    return mudou;
  }

  /* ---- Injeção de estilos (uma vez) ---- */
  function ensureStyles() {
    if (!document.getElementById("spk-fonts")) {
      var f = document.createElement("link");
      f.id = "spk-fonts"; f.rel = "stylesheet"; f.href = FONTS_HREF;
      document.head.appendChild(f);
    }
    if (!document.getElementById("spk-css")) {
      var l = document.createElement("link");
      l.id = "spk-css"; l.rel = "stylesheet"; l.href = "css/palestrantes.css?v=6";
      document.head.appendChild(l);
    }
  }

  /* ---- Helper: criar elementos (seguro — sem innerHTML com dados) ---- */
  function el(tag, cls, txt) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (txt != null) node.textContent = txt;
    return node;
  }

  /* ---- Campo de texto simples num modal (label + input) ---- */
  function campoTexto(body, labelTxt, valor, placeholder) {
    var wrap = el("div", "spk-modal__field");
    wrap.appendChild(el("label", null, labelTxt));
    var inp = document.createElement("input");
    inp.type = "text";
    inp.value = valor || "";
    inp.placeholder = placeholder || "";
    wrap.appendChild(inp);
    body.appendChild(wrap);
    return inp;
  }

  /* ---- Tipos de sessão ("painel" = debate com vários palestrantes) ---- */
  var TIPOS = [
    { value: "sessao",   label: "Sessão" },
    { value: "keynote",  label: "Keynote" },
    { value: "painel",   label: "Painel" },
    { value: "especial", label: "Especial" }
  ];

  function rotuloTipo(tipo) {
    for (var i = 0; i < TIPOS.length; i++) if (TIPOS[i].value === tipo) return TIPOS[i].label;
    return "Sessão";
  }

  /* ---- Campo de tipo de sessão (label + select) ---- */
  function campoTipo(body, valor) {
    var wrap = el("div", "spk-modal__field");
    wrap.appendChild(el("label", null, "Tipo"));
    var sel = document.createElement("select");
    TIPOS.forEach(function (o) {
      var opt = document.createElement("option");
      opt.value = o.value;
      opt.textContent = o.label;
      sel.appendChild(opt);
    });
    sel.value = valor || "sessao";
    wrap.appendChild(sel);
    body.appendChild(wrap);
    return sel;
  }

  /* ---- Campo de horário (label + input type=time) ---- */
  function campoHora(body, labelTxt, valorHHMM) {
    var wrap = el("div", "spk-modal__field");
    wrap.appendChild(el("label", null, labelTxt));
    var inp = document.createElement("input");
    inp.type = "time";
    inp.step = "60";
    inp.value = valorHHMM || "";
    wrap.appendChild(inp);
    body.appendChild(wrap);
    return inp;
  }

  /* ---- Parseia "HHhMM - HHhMM" (formato salvo) em minutos ---- */
  function parseHorarioStorage(horarioStr) {
    var partes = (horarioStr || "").split(" - ");
    if (partes.length !== 2) return null;
    var ini = partes[0].split("h");
    var fim = partes[1].split("h");
    if (ini.length !== 2 || fim.length !== 2) return null;
    var inicio = parseInt(ini[0], 10) * 60 + parseInt(ini[1], 10);
    var fimMin = parseInt(fim[0], 10) * 60 + parseInt(fim[1], 10);
    if (isNaN(inicio) || isNaN(fimMin)) return null;
    return { inicio: inicio, fim: fimMin };
  }

  /* ---- Parseia "HH:MM" (formato nativo do <input type=time>) em minutos ---- */
  function parseHoraInput(hhmm) {
    var partes = (hhmm || "").split(":");
    if (partes.length !== 2) return null;
    var min = parseInt(partes[0], 10) * 60 + parseInt(partes[1], 10);
    return isNaN(min) ? null : min;
  }

  /* ---- Formata minutos de volta para "HHhMM - HHhMM" ---- */
  function formatarHorario(iniMin, fimMin) {
    function pad(n) { return (n < 10 ? "0" : "") + n; }
    function fmt(min) { return pad(Math.floor(min / 60)) + "h" + pad(min % 60); }
    return fmt(iniMin) + " - " + fmt(fimMin);
  }

  /* ---- Duas faixas de horário (em minutos) se sobrepõem? ---- */
  function faixasSobrepoem(iniA, fimA, iniB, fimB) {
    return iniA < fimB && iniB < fimA;
  }

  /* ---- Primeira sessão do palco cujo horário conflita com [iniMin, fimMin) ---- */
  function buscarConflito(palco, iniMin, fimMin) {
    var sessoes = palco.sessoes || [];
    for (var i = 0; i < sessoes.length; i++) {
      var range = parseHorarioStorage(sessoes[i].horario);
      if (!range) continue;
      if (faixasSobrepoem(iniMin, fimMin, range.inicio, range.fim)) return sessoes[i];
    }
    return null;
  }

  /* ---- Uma sessão está confirmada? (status explícito, com fallback legado) ---- */
  function estaConfirmada(s) {
    if (s.status) return s.status === "confirmado";
    return palestrantesDaSessao(s).length > 0;
  }

  /* ---- Contar confirmados num palco ---- */
  function confirmados(palco) {
    return (palco.sessoes || []).filter(estaConfirmada).length;
  }

  /* ---- Conta total de slots e confirmados nos dois palcos ---- */
  function totais(palcos) {
    var total = 0, conf = 0;
    (palcos || []).forEach(function (p) {
      (p.sessoes || []).forEach(function (s) {
        total++;
        if (estaConfirmada(s)) conf++;
      });
    });
    return { total: total, confirmados: conf, faltam: total - conf };
  }

  /* ---- Palestrantes confirmados na aba Prospecção (única fonte válida) ---- */
  function listarConfirmadosProspeccao(data) {
    var candidatos = (data && data.prospeccao && data.prospeccao.candidatos) || [];
    var lista = candidatos
      .filter(function (c) { return c.status === "confirmado" && c.nome && c.nome.trim(); })
      .map(function (c) {
        return {
          nome: c.nome.trim(),
          empresa: c.empresa || "",
          linkedin: c.linkedin || "",
          fotoDataUrl: c.foto || ""
        };
      });
    lista.sort(function (a, b) { return a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }); });
    return lista;
  }

  /* ---- Formata minutos para "HH:MM" (valor do <input type=time>) ---- */
  function minutosParaInput(min) {
    function pad(n) { return (n < 10 ? "0" : "") + n; }
    return pad(Math.floor(min / 60)) + ":" + pad(min % 60);
  }

  /* ---- Modal de edição ---- */
  function abrirModal(sess, palco, onSave, listaConfirmados, localAtualDoPalestrante) {
    listaConfirmados = listaConfirmados || [];
    var overlay = el("div", "spk-modal-overlay");
    var modal = el("div", "spk-modal");
    overlay.appendChild(modal);

    var head = el("div", "spk-modal__head");
    head.appendChild(el("h3", null, sess.titulo));
    head.appendChild(el("p", null, palco.nome + " · " + sess.horario));
    modal.appendChild(head);

    var body = el("div", "spk-modal__body");

    var inpTitulo = campoTexto(body, "Título da sessão", sess.titulo, "Ex.: Keynote 3");
    var selTipo = campoTipo(body, sess.tipo);

    var rangeAtual = parseHorarioStorage(sess.horario);
    var inpInicio = campoHora(body, "Início", rangeAtual ? minutosParaInput(rangeAtual.inicio) : "");
    var inpFim    = campoHora(body, "Fim",    rangeAtual ? minutosParaInput(rangeAtual.fim) : "");

    /* Palestrantes: uma linha por pessoa (painéis de debate têm várias).
       Cada pessoa só pode vir da lista de confirmados em Prospecção —
       não dá pra digitar um nome novo direto aqui. Nomes antigos que não
       estão mais na lista ganham uma opção extra "fora da lista", pra não
       perder o dado sem querer. Se a pessoa já estiver escalada em outra
       sessão, o rótulo mostra onde. */
    var wrapPals = el("div", "spk-modal__field");
    wrapPals.appendChild(el("label", null, "Palestrantes"));
    var listaPalsEl = el("div", "spk-modal__pal-list");
    wrapPals.appendChild(listaPalsEl);
    var btnAddPal = el("button", "btn sm spk-modal__pal-add", "+ Adicionar palestrante");
    btnAddPal.type = "button";
    wrapPals.appendChild(btnAddPal);
    body.appendChild(wrapPals);

    var linhas = [];

    function contarEscolhidos() {
      return linhas.filter(function (l) { return l.sel.value !== ""; }).length;
    }

    function criarLinha(atual) {
      var nomeAtual = atual ? (atual.nome || "").trim() : "";
      var row = el("div", "spk-modal__pal-row");

      var topo = el("div", "spk-modal__pal-top");
      var sel = document.createElement("select");
      var optVazio = document.createElement("option");
      optVazio.value = "";
      optVazio.textContent = "— Nenhum / a definir —";
      sel.appendChild(optVazio);

      var opcoes = listaConfirmados.slice();
      var idxAtual = -1;
      for (var oi = 0; oi < opcoes.length; oi++) {
        if (opcoes[oi].nome.toLowerCase() === nomeAtual.toLowerCase()) { idxAtual = oi; break; }
      }
      if (nomeAtual && idxAtual === -1) {
        opcoes = [{
          nome: nomeAtual,
          empresa: atual.empresa || "",
          linkedin: atual.linkedin || "",
          fotoDataUrl: atual.fotoDataUrl || "",
          _foraDaLista: true
        }].concat(opcoes);
        idxAtual = 0;
      }
      opcoes.forEach(function (perfil, idx) {
        var opt = document.createElement("option");
        opt.value = String(idx);
        var rotulo = perfil.empresa ? (perfil.nome + " · " + perfil.empresa) : perfil.nome;
        if (perfil._foraDaLista) {
          rotulo += " (fora da lista de confirmados)";
        } else if (typeof localAtualDoPalestrante === "function") {
          var ocupacao = localAtualDoPalestrante(perfil.nome);
          if (ocupacao && ocupacao.sessId !== sess.id) {
            rotulo += " (" + ocupacao.palco + " · " + ocupacao.horario + ")";
          }
        }
        opt.textContent = rotulo;
        sel.appendChild(opt);
      });
      if (idxAtual !== -1) sel.value = String(idxAtual);
      topo.appendChild(sel);

      var btnRem = el("button", "btn sm btn-danger", "Remover");
      btnRem.type = "button";
      btnRem.title = "Tirar esta pessoa da sessão";
      topo.appendChild(btnRem);
      row.appendChild(topo);

      /* -- Preview só leitura do perfil (empresa/foto/LinkedIn vêm de Prospecção) -- */
      var wrapPreview = el("div", "spk-modal__preview");
      var previewFoto = document.createElement("img");
      previewFoto.alt = "Foto";
      previewFoto.style.cssText = "display:none;width:48px;height:48px;border-radius:50%;object-fit:cover;flex-shrink:0;";
      wrapPreview.appendChild(previewFoto);
      var previewTexto = el("span", "spk-modal__preview-texto", "");
      wrapPreview.appendChild(previewTexto);
      var previewLink = document.createElement("a");
      previewLink.target = "_blank";
      previewLink.rel = "noopener noreferrer";
      previewLink.textContent = "LinkedIn ↗";
      previewLink.style.cssText = "display:none;margin-left:8px;";
      wrapPreview.appendChild(previewLink);
      row.appendChild(wrapPreview);

      function atualizarPreview(perfil) {
        if (perfil && perfil.fotoDataUrl) {
          previewFoto.src = perfil.fotoDataUrl;
          previewFoto.style.display = "block";
        } else {
          previewFoto.style.display = "none";
        }
        previewTexto.textContent = perfil ? (perfil.empresa || "Sem empresa cadastrada em Prospecção") : "";
        if (perfil && perfil.linkedin) {
          previewLink.href = perfil.linkedin;
          previewLink.style.display = "inline";
        } else {
          previewLink.style.display = "none";
        }
      }
      atualizarPreview(idxAtual !== -1 ? opcoes[idxAtual] : null);

      /* -- Bio (de cada pessoa) -- */
      var txtBio = document.createElement("textarea");
      txtBio.rows = 2;
      txtBio.value = (atual && atual.bio) || "";
      txtBio.placeholder = "Mini-biografia (será exibida no programa)";
      row.appendChild(txtBio);

      var linha = { row: row, sel: sel, txtBio: txtBio, opcoes: opcoes };
      linhas.push(linha);
      listaPalsEl.appendChild(row);

      /* Status acompanha a lista: 1ª pessoa escolhida → confirmado;
         lista esvaziada → a definir. */
      var tinhaAntes = sel.value !== "";
      sel.addEventListener("change", function () {
        var antes = contarEscolhidos() - (sel.value !== "" ? 1 : 0) + (tinhaAntes ? 1 : 0);
        tinhaAntes = sel.value !== "";
        atualizarPreview(sel.value === "" ? null : opcoes[Number(sel.value)]);
        var agora = contarEscolhidos();
        if (agora === 0) selStatus.value = "a_definir";
        else if (antes === 0) selStatus.value = "confirmado";
      });

      btnRem.addEventListener("click", function () {
        var tinha = sel.value !== "";
        linhas.splice(linhas.indexOf(linha), 1);
        listaPalsEl.removeChild(row);
        if (!linhas.length) criarLinha(null);
        if (tinha && contarEscolhidos() === 0) selStatus.value = "a_definir";
      });

      return linha;
    }

    var palsAtuais = palestrantesDaSessao(sess);
    if (palsAtuais.length) palsAtuais.forEach(criarLinha);
    else criarLinha(null);

    btnAddPal.addEventListener("click", function () {
      criarLinha(null).sel.focus();
    });

    var wrapStatus = el("div", "spk-modal__field");
    wrapStatus.appendChild(el("label", null, "Status"));
    var selStatus = document.createElement("select");
    STATUS_ORDER.forEach(function (key) {
      var opt = document.createElement("option");
      opt.value = key;
      opt.textContent = STATUS[key].label;
      selStatus.appendChild(opt);
    });
    selStatus.value = (sess.status && STATUS[sess.status]) ? sess.status
      : (palsAtuais.length ? "confirmado" : "a_definir");
    wrapStatus.appendChild(selStatus);
    body.appendChild(wrapStatus);

    var wrapTema = el("div", "spk-modal__field");
    wrapTema.appendChild(el("label", null, "Tema / Título da palestra"));
    var txtTema = document.createElement("textarea");
    txtTema.rows = 2;
    txtTema.value = sess.tema || "";
    txtTema.placeholder = "Descreva o tema (opcional)";
    wrapTema.appendChild(txtTema);
    body.appendChild(wrapTema);

    var erroEl = el("p", "spk-field-hint spk-field-hint--error", "");
    erroEl.style.display = "none";
    body.appendChild(erroEl);

    function mostrarErro(msg) {
      erroEl.textContent = msg;
      erroEl.style.display = "block";
    }

    modal.appendChild(body);

    var foot = el("div", "spk-modal__foot");
    var btnCancel = el("button", "btn sm", "Cancelar");
    btnCancel.type = "button";
    var btnSave = el("button", "btn sm btn-primary", "Salvar");
    btnSave.type = "button";
    foot.appendChild(btnCancel);
    foot.appendChild(btnSave);
    modal.appendChild(foot);

    document.body.appendChild(overlay);
    linhas[0].sel.focus();

    function fechar() { document.body.removeChild(overlay); }

    btnCancel.addEventListener("click", fechar);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) fechar(); });
    btnSave.addEventListener("click", function () {
      var horarioNovo = sess.horario;
      if (inpInicio.value || inpFim.value) {
        var iniMin = parseHoraInput(inpInicio.value);
        var fimMin = parseHoraInput(inpFim.value);
        if (iniMin === null || fimMin === null) { mostrarErro("Informe o horário de início e de fim."); return; }
        if (fimMin <= iniMin) { mostrarErro("O horário de fim deve ser depois do início."); return; }
        var conflito = buscarConflito(palco, iniMin, fimMin);
        if (conflito && conflito.id !== sess.id) {
          mostrarErro('Conflita com "' + conflito.titulo + '" (' + conflito.horario + ').');
          return;
        }
        horarioNovo = formatarHorario(iniMin, fimMin);
      }
      var palestrantes = [];
      var vistos = {};
      for (var li = 0; li < linhas.length; li++) {
        var linha = linhas[li];
        if (linha.sel.value === "") continue;
        var perfil = linha.opcoes[Number(linha.sel.value)];
        var chave = perfil.nome.toLowerCase();
        if (vistos[chave]) { mostrarErro(perfil.nome + " aparece mais de uma vez nesta sessão."); return; }
        vistos[chave] = true;
        palestrantes.push({
          nome:        perfil.nome,
          empresa:     perfil.empresa || "",
          linkedin:    perfil.linkedin || "",
          fotoDataUrl: perfil.fotoDataUrl || "",
          bio:         linha.txtBio.value.trim()
        });
      }
      onSave({
        horario:      horarioNovo,
        titulo:       inpTitulo.value.trim() || sess.titulo,
        tipo:         selTipo.value,
        status:       selStatus.value,
        tema:         txtTema.value.trim(),
        palestrantes: palestrantes
      });
      fechar();
    });
  }

  /* ---- Modal: novo horário para um palco ---- */
  function abrirModalNovoHorario(palco, onAdd) {
    var overlay = el("div", "spk-modal-overlay");
    var modal = el("div", "spk-modal");
    overlay.appendChild(modal);

    var head = el("div", "spk-modal__head");
    head.appendChild(el("h3", null, "Novo horário"));
    head.appendChild(el("p", null, palco.nome));
    modal.appendChild(head);

    var body = el("div", "spk-modal__body");

    var inpTitulo = campoTexto(body, "Título da sessão", "", "Ex.: Sessão paralela C1");

    var selTipo = campoTipo(body, "sessao");

    var inpInicio = campoHora(body, "Início", "");
    var inpFim = campoHora(body, "Fim", "");

    var erroEl = el("p", "spk-field-hint spk-field-hint--error", "");
    erroEl.style.display = "none";
    body.appendChild(erroEl);

    function mostrarErro(msg) {
      erroEl.textContent = msg;
      erroEl.style.display = "block";
    }

    modal.appendChild(body);

    var foot = el("div", "spk-modal__foot");
    var btnCancel = el("button", "btn sm", "Cancelar");
    btnCancel.type = "button";
    var btnSave = el("button", "btn sm btn-primary", "Adicionar");
    btnSave.type = "button";
    foot.appendChild(btnCancel);
    foot.appendChild(btnSave);
    modal.appendChild(foot);

    document.body.appendChild(overlay);
    inpTitulo.focus();

    function fechar() { document.body.removeChild(overlay); }

    btnCancel.addEventListener("click", fechar);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) fechar(); });
    btnSave.addEventListener("click", function () {
      var titulo = inpTitulo.value.trim();
      if (!titulo) { mostrarErro("Informe um título para a sessão."); return; }

      var iniMin = parseHoraInput(inpInicio.value);
      var fimMin = parseHoraInput(inpFim.value);
      if (iniMin === null || fimMin === null) { mostrarErro("Informe o horário de início e de fim."); return; }
      if (fimMin <= iniMin) { mostrarErro("O horário de fim deve ser depois do início."); return; }

      var conflito = buscarConflito(palco, iniMin, fimMin);
      if (conflito) {
        mostrarErro('Conflita com "' + conflito.titulo + '" (' + conflito.horario + ').');
        return;
      }

      onAdd({ titulo: titulo, tipo: selTipo.value, iniMin: iniMin, fimMin: fimMin });
      fechar();
    });
  }

  /* ---- Uma pessoa dentro da linha de sessão ----
     Empresa/LinkedIn/Foto vêm ao vivo do perfil confirmado em
     Prospecção (por nome); nome sem correspondência cai no valor já
     gravado na sessão, sem perder dado. */
  function buildSpeaker(pal, listaConfirmados) {
    var nome = (pal.nome || "").trim();
    var perfil = null;
    for (var pi = 0; pi < (listaConfirmados || []).length; pi++) {
      if (listaConfirmados[pi].nome.toLowerCase() === nome.toLowerCase()) {
        perfil = listaConfirmados[pi];
        break;
      }
    }
    var empresa  = perfil ? perfil.empresa     : (pal.empresa || "");
    var linkedin = perfil ? perfil.linkedin    : (pal.linkedin || "");
    var foto     = perfil ? perfil.fotoDataUrl : (pal.fotoDataUrl || "");

    var wrap = el("div", "spk-speaker");
    var info = el("div", "spk-speaker__info");

    var speakerDiv = el("div", "spk-sess__speaker");
    speakerDiv.appendChild(el("span", null, nome));
    if (linkedin) {
      var lkEl = document.createElement("a");
      lkEl.href = linkedin;
      lkEl.target = "_blank";
      lkEl.rel = "noopener noreferrer";
      lkEl.textContent = " 🔗";
      lkEl.style.cssText = "margin-left:4px;text-decoration:none;";
      speakerDiv.appendChild(lkEl);
    }
    info.appendChild(speakerDiv);

    if (empresa) info.appendChild(el("div", "spk-sess__empresa", empresa));
    if (pal.bio) {
      var bioTxt = pal.bio.length > 80 ? pal.bio.slice(0, 80) + "…" : pal.bio;
      info.appendChild(el("p", "spk-sess__bio", bioTxt));
    }
    wrap.appendChild(info);

    if (foto) {
      var fotoEl = document.createElement("img");
      fotoEl.src = foto;
      fotoEl.alt = nome;
      fotoEl.className = "spk-sess__foto";
      wrap.appendChild(fotoEl);
    }
    return wrap;
  }

  /* ---- Linha de sessão ---- */
  function buildSessao(sess, palco, isMaster, onEdit, onSwap, onRemove, listaConfirmados, localAtualDoPalestrante) {
    var tipo = sess.tipo || "sessao";
    var row = el("div", "spk-sess spk-sess--" + tipo);

    if (isMaster) {
      /* Arrastar o "⠿" move o palestrante (e seus dados) desta sessão
         para a sessão onde for solto — troca de horário e/ou palco. */
      var handle = el("span", "spk-sess__handle", "⠿");
      handle.title = "Arraste para mudar de horário ou palco";
      handle.draggable = true;
      handle.addEventListener("dragstart", function (e) {
        e.dataTransfer.setData("text/plain", sess.id);
        e.dataTransfer.effectAllowed = "move";
        row.classList.add("spk-sess--dragging");
      });
      handle.addEventListener("dragend", function () {
        row.classList.remove("spk-sess--dragging");
      });
      row.appendChild(handle);

      row.addEventListener("dragover", function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        row.classList.add("spk-sess--dragover");
      });
      row.addEventListener("dragleave", function () {
        row.classList.remove("spk-sess--dragover");
      });
      row.addEventListener("drop", function (e) {
        e.preventDefault();
        row.classList.remove("spk-sess--dragover");
        var origemId = e.dataTransfer.getData("text/plain");
        if (!origemId || origemId === sess.id) return;
        onSwap(origemId, sess.id);
      });
    }

    row.appendChild(el("div", "spk-sess__time", sess.horario));

    var body = el("div", "spk-sess__body");

    var tipoBadge = el("span", "spk-tipo spk-tipo--" + tipo);
    tipoBadge.textContent = rotuloTipo(tipo);
    body.appendChild(tipoBadge);

    body.appendChild(el("div", "spk-sess__titulo", sess.titulo));

    var pals = palestrantesDaSessao(sess);
    var confirmada = estaConfirmada(sess);

    if (!pals.length) {
      body.appendChild(el("div", "spk-sess__speaker is-empty", "(a definir)"));
    } else {
      if (!confirmada) {
        body.appendChild(el("span", "spk-status-badge spk-status-badge--" + sess.status, STATUS[sess.status] ? STATUS[sess.status].label : "Convidado"));
      }
      var speakersEl = el("div", "spk-sess__speakers");
      pals.forEach(function (pal) {
        speakersEl.appendChild(buildSpeaker(pal, listaConfirmados));
      });
      body.appendChild(speakersEl);
      if (sess.tema) {
        body.appendChild(el("div", "spk-sess__tema", "“" + sess.tema + "”"));
      }
    }

    row.appendChild(body);

    if (isMaster) {
      var actions = el("div", "spk-sess__actions");
      var btnEdit = el("button", "btn sm", "Editar");
      btnEdit.type = "button";
      btnEdit.addEventListener("click", function () {
        abrirModal(sess, palco, function (vals) { onEdit(sess.id, vals); }, listaConfirmados, localAtualDoPalestrante);
      });
      actions.appendChild(btnEdit);

      var btnRemover = el("button", "btn sm btn-danger", "Remover");
      btnRemover.type = "button";
      btnRemover.addEventListener("click", function () {
        window.Gestao.confirm('Remover "' + sess.titulo + '" (' + sess.horario + ')?', function () {
          onRemove(sess.id);
        });
      });
      actions.appendChild(btnRemover);

      row.appendChild(actions);
    }

    return row;
  }

  /* ---- Card de um palco ---- */
  function buildCard(palco, isMaster, onEdit, onSwap, onAdd, onRemove, listaConfirmados, localAtualDoPalestrante) {
    var conf  = confirmados(palco);
    var total = (palco.sessoes || []).length;

    var card = el("div", "spk-card");
    card.setAttribute("data-cor", palco.cor || CORES_PALCOS[palco.id] || "roxo");

    var head = el("div", "spk-card__head");
    head.appendChild(el("h2", "spk-card__title", palco.nome || "Palco"));
    head.appendChild(el("span", "spk-card__badge", conf + "/" + total + " confirmados"));
    card.appendChild(head);

    (palco.sessoes || []).forEach(function (sess) {
      card.appendChild(buildSessao(sess, palco, isMaster, onEdit, onSwap, onRemove, listaConfirmados, localAtualDoPalestrante));
    });

    if (isMaster) {
      var addRow = el("div", "spk-card__add-row");
      var btnAdicionar = el("button", "btn btn-primary sm", "+ Adicionar horário");
      btnAdicionar.type = "button";
      btnAdicionar.addEventListener("click", function () {
        abrirModalNovoHorario(palco, function (vals) { onAdd(palco.id, vals); });
      });
      addRow.appendChild(btnAdicionar);
      card.appendChild(addRow);
    }

    return card;
  }

  /* ---- Render principal ---- */
  function render(mount, data) {
    ensureStyles();
    mount.innerHTML = "";
    data = data || {};

    var plData = data.palestrantes || {};
    var palcos = (plData.palcos && plData.palcos.length) ? plData.palcos : null;

    /* Banco existente sem palestrantes: auto-inicializa e salva */
    if (!palcos) {
      palcos = JSON.parse(JSON.stringify(PALCOS_DEFAULT));
      migrarStatus(palcos);
      migrarListaPalestrantes(palcos);
      plData.palcos = palcos;
      data.palestrantes = plData;
      if (window.Gestao && window.Gestao.save) window.Gestao.save();
    } else {
      var precisaSalvar = false;
      if (migrarMelhoresDoAno(palcos)) precisaSalvar = true;
      if (migrarRemovePalcoGpElas(palcos)) precisaSalvar = true;
      if (migrarNomesPalcos(palcos)) precisaSalvar = true;
      if (migrarStatus(palcos)) precisaSalvar = true;
      if (migrarListaPalestrantes(palcos)) precisaSalvar = true;
      if (precisaSalvar) {
        data.palestrantes = plData;
        if (window.Gestao && window.Gestao.save) window.Gestao.save();
      }
    }

    var t = totais(palcos);

    mount.appendChild(window.Gestao.pageHeader({
      eyebrow: "PALESTRAS · SUMMIT POA PMIRS 2026",
      title: "Palestras",
      subtitle: t.confirmados + " confirmados · " + t.faltam + " a definir · " + t.total + " sessões"
    }));

    var prog = el("div", "spk-progress");
    [
      [t.confirmados, "Confirmados"],
      [t.faltam, "A definir"],
      [t.total, "Total de sessões"]
    ].forEach(function (pair) {
      var item = el("div", "spk-progress__item");
      item.appendChild(el("div", "spk-progress__val", String(pair[0])));
      item.appendChild(el("div", "spk-progress__lbl", pair[1]));
      prog.appendChild(item);
    });
    mount.appendChild(prog);

    if (!palcos.length) {
      mount.appendChild(el("div", "empty", "Nenhum palco cadastrado."));
      return;
    }

    var isMaster = window.Gestao && window.Gestao.role === "master";

    function onEdit(sessId, vals) {
      palcos.forEach(function (palco) {
        var mudouHorario = false;
        (palco.sessoes || []).forEach(function (s) {
          if (s.id === sessId) {
            if (vals.horario && vals.horario !== s.horario) {
              s.horario = vals.horario;
              mudouHorario = true;
            }
            s.titulo       = vals.titulo;
            s.tipo         = vals.tipo;
            s.status       = vals.status;
            s.tema         = vals.tema;
            s.palestrantes = vals.palestrantes;
            CAMPOS_LEGADOS.forEach(function (c) { delete s[c]; });
          }
        });
        if (mudouHorario) {
          palco.sessoes.sort(function (a, b) {
            var ra = parseHorarioStorage(a.horario), rb = parseHorarioStorage(b.horario);
            return (ra ? ra.inicio : 0) - (rb ? rb.inicio : 0);
          });
        }
      });
      data.palestrantes = plData;
      window.Gestao.save();
      window.Gestao.toast("Palestrante salvo");
      render(mount, data);
    }

    var CAMPOS_PALESTRANTE = ["palestrantes", "status", "tema"];

    function onSwap(origemId, destId) {
      var origem = null, destino = null;
      palcos.forEach(function (palco) {
        (palco.sessoes || []).forEach(function (s) {
          if (s.id === origemId) origem = s;
          if (s.id === destId) destino = s;
        });
      });
      if (!origem || !destino) return;

      var tmp = {};
      CAMPOS_PALESTRANTE.forEach(function (c) { tmp[c] = origem[c]; });
      CAMPOS_PALESTRANTE.forEach(function (c) { origem[c] = destino[c]; });
      CAMPOS_PALESTRANTE.forEach(function (c) { destino[c] = tmp[c]; });

      data.palestrantes = plData;
      window.Gestao.save();
      window.Gestao.toast("Palestrante movido");
      render(mount, data);
    }

    function onAdd(palcoId, vals) {
      var palco = null;
      palcos.forEach(function (p) { if (p.id === palcoId) palco = p; });
      if (!palco) return;

      var novaSessao = {
        id: window.Gestao.uid("sess"),
        horario: formatarHorario(vals.iniMin, vals.fimMin),
        titulo: vals.titulo,
        tipo: vals.tipo,
        status: "a_definir",
        tema: "",
        palestrantes: []
      };
      palco.sessoes = palco.sessoes || [];
      palco.sessoes.push(novaSessao);
      palco.sessoes.sort(function (a, b) {
        var ra = parseHorarioStorage(a.horario), rb = parseHorarioStorage(b.horario);
        return (ra ? ra.inicio : 0) - (rb ? rb.inicio : 0);
      });

      data.palestrantes = plData;
      window.Gestao.save();
      window.Gestao.toast("Horário adicionado");
      render(mount, data);
    }

    function onRemove(sessId) {
      var removeu = false;
      palcos.forEach(function (palco) {
        var idx = -1;
        (palco.sessoes || []).forEach(function (s, i) { if (s.id === sessId) idx = i; });
        if (idx !== -1) {
          palco.sessoes.splice(idx, 1);
          removeu = true;
        }
      });
      if (!removeu) return;

      data.palestrantes = plData;
      window.Gestao.save();
      window.Gestao.toast("Horário removido");
      render(mount, data);
    }

    /* Onde (palco/horário) uma pessoa já está escalada, se estiver */
    function localAtualDoPalestrante(nome) {
      var alvo = (nome || "").trim().toLowerCase();
      if (!alvo) return null;
      for (var pi = 0; pi < palcos.length; pi++) {
        var p = palcos[pi];
        for (var si = 0; si < (p.sessoes || []).length; si++) {
          var s = p.sessoes[si];
          var escalado = palestrantesDaSessao(s).some(function (pal) {
            return (pal.nome || "").trim().toLowerCase() === alvo;
          });
          if (escalado) return { sessId: s.id, palco: p.nome, horario: s.horario };
        }
      }
      return null;
    }

    var listaConfirmados = listarConfirmadosProspeccao(data);

    var grid = el("div", "spk-grid");
    palcos.forEach(function (palco) {
      grid.appendChild(buildCard(palco, isMaster, onEdit, onSwap, onAdd, onRemove, listaConfirmados, localAtualDoPalestrante));
    });
    mount.appendChild(grid);
  }

  /* ---- Registro ---- */
  if (typeof window !== "undefined" && window.Gestao && window.Gestao.onTab) {
    window.Gestao.onTab("tab-palestrantes", render);
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { totais: totais, confirmados: confirmados };
  }
})();
