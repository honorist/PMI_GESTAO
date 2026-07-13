/* ============================================================
   palestrantes.js — Aba "Palestrantes" do app de gestão
   ------------------------------------------------------------
   Exibe os 2 palcos (Principal e Secundário) com a lista de
   sessões. Palestrante, empresa e tema são editáveis em modo
   master. Sessões sem palestrante aparecem como "(a definir)".

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
      id: "principal", nome: "Palco Principal",
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
      id: "secundario", nome: "Palco Secundário",
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
    },
    {
      id: "gp_elas", nome: "GP com Elas", cor: "rosa",
      sessoes: [
        { id: "gp1", horario: "10h00 - 10h20", titulo: "Sessão GP com Elas 1", tipo: "sessao", palestrante: "", empresa: "", tema: "" },
        { id: "gp2", horario: "10h20 - 10h40", titulo: "Sessão GP com Elas 2", tipo: "sessao", palestrante: "", empresa: "", tema: "" },
        { id: "gp3", horario: "10h40 - 11h00", titulo: "Sessão GP com Elas 3", tipo: "sessao", palestrante: "", empresa: "", tema: "" },
        { id: "gp4", horario: "11h00 - 12h00", titulo: "Sessão GP com Elas 4", tipo: "sessao", palestrante: "", empresa: "", tema: "" },
        { id: "gp5", horario: "14h30 - 14h50", titulo: "Sessão GP com Elas 5", tipo: "sessao", palestrante: "", empresa: "", tema: "" },
        { id: "gp6", horario: "14h50 - 15h10", titulo: "Sessão GP com Elas 6", tipo: "sessao", palestrante: "", empresa: "", tema: "" },
        { id: "gp7", horario: "15h10 - 15h30", titulo: "Sessão GP com Elas 7", tipo: "sessao", palestrante: "", empresa: "", tema: "" },
        { id: "gp8", horario: "16h00 - 17h00", titulo: "Sessão GP com Elas 8", tipo: "sessao", palestrante: "", empresa: "", tema: "" },
        { id: "gp9", horario: "17h00 - 18h00", titulo: "Sessão GP com Elas 9", tipo: "sessao", palestrante: "", empresa: "", tema: "" }
      ]
    }
  ];

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

  /* ---- Migração: adiciona o palco "GP com Elas" se ainda não existir ---- */
  function migrarPalcoGpElas(palcos) {
    var jaTem = palcos.some(function (p) { return p.id === "gp_elas"; });
    if (jaTem) return false;
    var novoPalco = JSON.parse(JSON.stringify(PALCOS_DEFAULT[PALCOS_DEFAULT.length - 1]));
    palcos.push(novoPalco);
    return true;
  }

  /* ---- Migração: dá um status explícito a sessões que não têm ---- */
  function migrarStatus(palcos) {
    var mudou = false;
    for (var i = 0; i < palcos.length; i++) {
      var sessoes = palcos[i].sessoes || [];
      for (var j = 0; j < sessoes.length; j++) {
        var s = sessoes[j];
        if (!s.status || !STATUS[s.status]) {
          s.status = (s.palestrante && s.palestrante.trim()) ? "confirmado" : "a_definir";
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
      l.id = "spk-css"; l.rel = "stylesheet"; l.href = "css/palestrantes.css?v=2";
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
    return !!(s.palestrante && s.palestrante.trim());
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

    var rangeAtual = parseHorarioStorage(sess.horario);
    var inpInicio = campoHora(body, "Início", rangeAtual ? minutosParaInput(rangeAtual.inicio) : "");
    var inpFim    = campoHora(body, "Fim",    rangeAtual ? minutosParaInput(rangeAtual.fim) : "");

    /* Palestrante só pode vir da lista de confirmados em Prospecção —
       não dá pra digitar um nome novo direto aqui. Sessões antigas com
       um nome que não está mais na lista ganham uma opção extra
       "fora da lista", pra não perder o dado sem querer. Se a pessoa já
       estiver escalada em outra sessão, o rótulo mostra onde. */
    var wrapPalestrante = el("div", "spk-modal__field");
    wrapPalestrante.appendChild(el("label", null, "Palestrante"));
    var selPalestrante = document.createElement("select");
    var optVazio = document.createElement("option");
    optVazio.value = "";
    optVazio.textContent = "— Nenhum / a definir —";
    selPalestrante.appendChild(optVazio);

    var nomeAtual = (sess.palestrante || "").trim();
    var opcoesPalestrante = listaConfirmados.slice();
    var idxAtual = -1;
    for (var oi = 0; oi < opcoesPalestrante.length; oi++) {
      if (opcoesPalestrante[oi].nome.toLowerCase() === nomeAtual.toLowerCase()) { idxAtual = oi; break; }
    }
    if (nomeAtual && idxAtual === -1) {
      opcoesPalestrante = [{
        nome: nomeAtual,
        empresa: sess.empresa || "",
        linkedin: sess.linkedin || "",
        fotoDataUrl: sess.fotoDataUrl || "",
        _foraDaLista: true
      }].concat(opcoesPalestrante);
      idxAtual = 0;
    }
    opcoesPalestrante.forEach(function (perfil, idx) {
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
      selPalestrante.appendChild(opt);
    });
    if (idxAtual !== -1) selPalestrante.value = String(idxAtual);
    wrapPalestrante.appendChild(selPalestrante);
    body.appendChild(wrapPalestrante);

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
    body.appendChild(wrapPreview);

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
    atualizarPreview(idxAtual !== -1 ? opcoesPalestrante[idxAtual] : null);

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
      : ((sess.palestrante && sess.palestrante.trim()) ? "confirmado" : "a_definir");
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

    /* -- Bio -- */
    var wrapBio = el("div", "spk-modal__field");
    wrapBio.appendChild(el("label", null, "Mini-biografia"));
    var txtBio = document.createElement("textarea");
    txtBio.rows = 3;
    txtBio.value = sess.bio || "";
    txtBio.placeholder = "Mini-biografia do palestrante (será exibida no programa)";
    wrapBio.appendChild(txtBio);
    body.appendChild(wrapBio);

    selPalestrante.addEventListener("change", function () {
      if (selPalestrante.value === "") {
        atualizarPreview(null);
        selStatus.value = "a_definir";
        return;
      }
      var perfil = opcoesPalestrante[Number(selPalestrante.value)];
      if (!perfil) return;
      atualizarPreview(perfil);
      selStatus.value = "confirmado";
    });

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
    selPalestrante.focus();

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
      var perfilEscolhido = selPalestrante.value !== "" ? opcoesPalestrante[Number(selPalestrante.value)] : null;
      onSave({
        horario:     horarioNovo,
        titulo:      inpTitulo.value.trim() || sess.titulo,
        palestrante: perfilEscolhido ? perfilEscolhido.nome : "",
        status:      selStatus.value,
        empresa:     perfilEscolhido ? (perfilEscolhido.empresa || "") : "",
        tema:        txtTema.value.trim(),
        bio:         txtBio.value.trim(),
        linkedin:    perfilEscolhido ? (perfilEscolhido.linkedin || "") : "",
        fotoDataUrl: perfilEscolhido ? (perfilEscolhido.fotoDataUrl || "") : ""
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

    var wrapTipo = el("div", "spk-modal__field");
    wrapTipo.appendChild(el("label", null, "Tipo"));
    var selTipo = document.createElement("select");
    [
      { value: "sessao", label: "Sessão" },
      { value: "keynote", label: "Keynote" },
      { value: "especial", label: "Especial" }
    ].forEach(function (o) {
      var opt = document.createElement("option");
      opt.value = o.value;
      opt.textContent = o.label;
      selTipo.appendChild(opt);
    });
    wrapTipo.appendChild(selTipo);
    body.appendChild(wrapTipo);

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
    tipoBadge.textContent = { keynote: "Keynote", especial: "Especial", sessao: "Sessão" }[tipo] || "Sessão";
    body.appendChild(tipoBadge);

    body.appendChild(el("div", "spk-sess__titulo", sess.titulo));

    var temPalestrante = sess.palestrante && sess.palestrante.trim();
    var confirmada = estaConfirmada(sess);
    var speakerDiv = el("div", "spk-sess__speaker" + (temPalestrante ? "" : " is-empty"));

    /* Empresa/LinkedIn/Foto vêm ao vivo do perfil confirmado em
       Prospecção (por nome); sessão antiga sem correspondência cai no
       valor já gravado nela mesma, sem perder dado. */
    var perfilExibir = null;
    if (temPalestrante) {
      for (var pi = 0; pi < (listaConfirmados || []).length; pi++) {
        if (listaConfirmados[pi].nome.toLowerCase() === sess.palestrante.trim().toLowerCase()) {
          perfilExibir = listaConfirmados[pi];
          break;
        }
      }
    }
    var empresaExibir  = perfilExibir ? perfilExibir.empresa  : (sess.empresa  || "");
    var linkedinExibir = perfilExibir ? perfilExibir.linkedin : (sess.linkedin || "");
    var fotoExibir     = perfilExibir ? perfilExibir.fotoDataUrl : (sess.fotoDataUrl || "");

    if (temPalestrante) {
      if (!confirmada) {
        speakerDiv.appendChild(el("span", "spk-status-badge spk-status-badge--" + sess.status, STATUS[sess.status] ? STATUS[sess.status].label : "Convidado"));
      }
      speakerDiv.appendChild(el("span", null, sess.palestrante));
      if (linkedinExibir) {
        var lkEl = document.createElement("a");
        lkEl.href = linkedinExibir;
        lkEl.target = "_blank";
        lkEl.rel = "noopener noreferrer";
        lkEl.textContent = " 🔗";
        lkEl.style.cssText = "margin-left:4px;text-decoration:none;";
        speakerDiv.appendChild(lkEl);
      }
    } else {
      speakerDiv.textContent = "(a definir)";
    }
    body.appendChild(speakerDiv);

    if (temPalestrante && sess.bio) {
      var bioTxt = sess.bio.length > 80 ? sess.bio.slice(0, 80) + "…" : sess.bio;
      body.appendChild(el("p", "spk-sess__bio", bioTxt));
    }

    if (temPalestrante && empresaExibir) {
      body.appendChild(el("div", "spk-sess__empresa", empresaExibir));
    }
    if (temPalestrante && sess.tema) {
      body.appendChild(el("div", "spk-sess__tema", "“" + sess.tema + "”"));
    }

    row.appendChild(body);

    if (temPalestrante && fotoExibir) {
      var fotoEl = document.createElement("img");
      fotoEl.src = fotoExibir;
      fotoEl.alt = sess.palestrante;
      fotoEl.className = "spk-sess__foto";
      row.appendChild(fotoEl);
    }

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
    card.setAttribute("data-cor", palco.cor || "roxo");

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
      plData.palcos = palcos;
      data.palestrantes = plData;
      if (window.Gestao && window.Gestao.save) window.Gestao.save();
    } else {
      var precisaSalvar = false;
      if (migrarMelhoresDoAno(palcos)) precisaSalvar = true;
      if (migrarPalcoGpElas(palcos)) precisaSalvar = true;
      if (migrarStatus(palcos)) precisaSalvar = true;
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
            s.palestrante  = vals.palestrante;
            s.status       = vals.status;
            s.empresa      = vals.empresa;
            s.tema         = vals.tema;
            s.bio          = vals.bio;
            s.linkedin     = vals.linkedin;
            s.fotoDataUrl  = vals.fotoDataUrl;
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

    var CAMPOS_PALESTRANTE = ["palestrante", "status", "empresa", "tema", "bio", "linkedin", "fotoDataUrl"];

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
        palestrante: "",
        status: "a_definir",
        empresa: "",
        tema: "",
        bio: "",
        linkedin: "",
        fotoDataUrl: ""
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
          if (s.palestrante && s.palestrante.trim().toLowerCase() === alvo) {
            return { sessId: s.id, palco: p.nome, horario: s.horario };
          }
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

    buildResultadoPanel(mount);
  }

  /* ---- Painel de resultado da votação ---- */
  var _resultadoTimer = null;

  function buildResultadoPanel(mount) {
    var painel = el("div", "spk-votacao-painel");

    var head = el("div", "spk-votacao-head");
    head.appendChild(el("h2", "spk-votacao-titulo", "Resultado da Votação"));
    var linkEl = document.createElement("a");
    linkEl.href = "/votacao.html";
    linkEl.target = "_blank";
    linkEl.className = "btn sm";
    linkEl.textContent = "Abrir página de votação ↗";
    head.appendChild(linkEl);
    painel.appendChild(head);

    var corpo = el("div", "spk-votacao-corpo");
    painel.appendChild(corpo);

    mount.appendChild(painel);
    carregarResultado(corpo);

    if (_resultadoTimer) clearInterval(_resultadoTimer);
    _resultadoTimer = setInterval(function () { carregarResultado(corpo); }, 10000);
  }

  function carregarResultado(corpo) {
    fetch("/api/votacao/resultado")
      .then(function (r) { return r.json(); })
      .then(function (resultado) { renderResultado(corpo, resultado); })
      .catch(function () { /* próximo tick vai tentar de novo */ });
  }

  var CATS_LABELS = {
    "melhor-projeto": "Melhor Projeto",
    "melhor-pmo":     "Melhor PMO"
  };

  function limparEl(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function renderResultado(corpo, resultado) {
    limparEl(corpo);
    var algumVoto = false;

    Object.keys(CATS_LABELS).forEach(function (catId) {
      var secao = el("div", "spk-votacao-cat");
      secao.appendChild(el("h3", "spk-votacao-cat-titulo", CATS_LABELS[catId]));

      var candidatos = resultado[catId] || [];
      if (!candidatos.length) {
        secao.appendChild(el("p", "spk-votacao-empty", "Nenhum voto ainda."));
      } else {
        algumVoto = true;
        var maxVotos = candidatos[0].votos;
        candidatos.forEach(function (c) {
          var pct = maxVotos > 0 ? Math.round(c.votos / maxVotos * 100) : 0;
          var linha = el("div", "spk-votacao-linha");
          linha.appendChild(el("span", "spk-votacao-cand", c.candidato_id));
          var barWrap = el("div", "spk-votacao-bar-wrap");
          var bar = el("div", "spk-votacao-bar");
          bar.style.width = pct + "%";
          barWrap.appendChild(bar);
          linha.appendChild(barWrap);
          linha.appendChild(el("span", "spk-votacao-cnt", c.votos + " voto" + (c.votos !== 1 ? "s" : "")));
          secao.appendChild(linha);
        });
      }
      corpo.appendChild(secao);
    });

    if (!algumVoto) {
      corpo.insertBefore(el("p", "spk-votacao-empty", "Aguardando votos…"), corpo.firstChild);
    }
  }

  /* ---- Registro ---- */
  if (typeof window !== "undefined" && window.Gestao && window.Gestao.onTab) {
    window.Gestao.onTab("tab-palestrantes", render);
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { totais: totais, confirmados: confirmados };
  }
})();
