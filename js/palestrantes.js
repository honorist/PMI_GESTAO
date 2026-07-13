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
      l.id = "spk-css"; l.rel = "stylesheet"; l.href = "css/palestrantes.css";
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

  /* ---- Modal de edição ---- */
  function abrirModal(sess, palcoNome, onSave) {
    var overlay = el("div", "spk-modal-overlay");
    var modal = el("div", "spk-modal");
    overlay.appendChild(modal);

    var head = el("div", "spk-modal__head");
    head.appendChild(el("h3", null, sess.titulo));
    head.appendChild(el("p", null, palcoNome + " · " + sess.horario));
    modal.appendChild(head);

    var body = el("div", "spk-modal__body");

    function campoTexto(labelTxt, valor, placeholder) {
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

    var inpNome = campoTexto("Palestrante", sess.palestrante, "Nome do palestrante");

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

    var inpEmpresa = campoTexto("Empresa / Organização", sess.empresa, "Ex.: PMI, CMPC, Gerdau…");

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

    /* -- LinkedIn -- */
    var wrapLinkedin = el("div", "spk-modal__field");
    wrapLinkedin.appendChild(el("label", null, "LinkedIn"));
    var inpLinkedin = document.createElement("input");
    inpLinkedin.type = "url";
    inpLinkedin.value = sess.linkedin || "";
    inpLinkedin.placeholder = "https://linkedin.com/in/...";
    wrapLinkedin.appendChild(inpLinkedin);
    body.appendChild(wrapLinkedin);

    /* -- Foto -- */
    var wrapFoto = el("div", "spk-modal__field");
    wrapFoto.appendChild(el("label", null, "Foto (máx. 300 KB)"));
    var fotoDataUrl = sess.fotoDataUrl || "";
    var fotoPreview = document.createElement("img");
    fotoPreview.alt = "Preview";
    fotoPreview.style.cssText = "display:" + (fotoDataUrl ? "block" : "none") + ";width:60px;height:60px;border-radius:50%;object-fit:cover;margin:4px 0;";
    if (fotoDataUrl) { fotoPreview.src = fotoDataUrl; }
    wrapFoto.appendChild(fotoPreview);
    var inpFoto = document.createElement("input");
    inpFoto.type = "file";
    inpFoto.accept = "image/*";
    inpFoto.addEventListener("change", function () {
      var file = inpFoto.files && inpFoto.files[0];
      if (!file) { return; }
      if (file.size > 300 * 1024) {
        if (window.Gestao && window.Gestao.toast) {
          window.Gestao.toast("Foto muito grande (máx. 300 KB)", "error");
        }
        inpFoto.value = "";
        return;
      }
      var reader = new FileReader();
      reader.onload = function (ev) {
        fotoDataUrl = ev.target.result;
        fotoPreview.src = fotoDataUrl;
        fotoPreview.style.display = "block";
      };
      reader.readAsDataURL(file);
    });
    wrapFoto.appendChild(inpFoto);
    body.appendChild(wrapFoto);

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
    inpNome.focus();

    function fechar() { document.body.removeChild(overlay); }

    btnCancel.addEventListener("click", fechar);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) fechar(); });
    btnSave.addEventListener("click", function () {
      onSave({
        palestrante: inpNome.value.trim(),
        status:      selStatus.value,
        empresa:     inpEmpresa.value.trim(),
        tema:        txtTema.value.trim(),
        bio:         txtBio.value.trim(),
        linkedin:    inpLinkedin.value.trim(),
        fotoDataUrl: fotoDataUrl
      });
      fechar();
    });
  }

  /* ---- Linha de sessão ---- */
  function buildSessao(sess, palcoNome, isMaster, onEdit, onSwap) {
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

    if (temPalestrante) {
      if (!confirmada) {
        speakerDiv.appendChild(el("span", "spk-status-badge spk-status-badge--" + sess.status, STATUS[sess.status] ? STATUS[sess.status].label : "Convidado"));
      }
      if (sess.fotoDataUrl) {
        var fotoEl = document.createElement("img");
        fotoEl.src = sess.fotoDataUrl;
        fotoEl.alt = sess.palestrante;
        fotoEl.style.cssText = "width:36px;height:36px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:6px;flex-shrink:0;";
        speakerDiv.appendChild(fotoEl);
      }
      speakerDiv.appendChild(el("span", null, sess.palestrante));
      if (sess.linkedin) {
        var lkEl = document.createElement("a");
        lkEl.href = sess.linkedin;
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

    if (temPalestrante && sess.empresa) {
      body.appendChild(el("div", "spk-sess__empresa", sess.empresa));
    }
    if (temPalestrante && sess.tema) {
      body.appendChild(el("div", "spk-sess__tema", "“" + sess.tema + "”"));
    }

    row.appendChild(body);

    if (isMaster) {
      var actions = el("div", "spk-sess__actions");
      var btnEdit = el("button", "btn sm", "Editar");
      btnEdit.type = "button";
      btnEdit.addEventListener("click", function () {
        abrirModal(sess, palcoNome, function (vals) { onEdit(sess.id, vals); });
      });
      actions.appendChild(btnEdit);
      row.appendChild(actions);
    }

    return row;
  }

  /* ---- Card de um palco ---- */
  function buildCard(palco, isMaster, onEdit, onSwap) {
    var conf  = confirmados(palco);
    var total = (palco.sessoes || []).length;

    var card = el("div", "spk-card");
    card.setAttribute("data-cor", palco.cor || "roxo");

    var head = el("div", "spk-card__head");
    head.appendChild(el("h2", "spk-card__title", palco.nome || "Palco"));
    head.appendChild(el("span", "spk-card__badge", conf + "/" + total + " confirmados"));
    card.appendChild(head);

    (palco.sessoes || []).forEach(function (sess) {
      card.appendChild(buildSessao(sess, palco.nome, isMaster, onEdit, onSwap));
    });

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
      eyebrow: "PALESTRANTES · SUMMIT POA PMIRS 2026",
      title: "Palestrantes",
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
        (palco.sessoes || []).forEach(function (s) {
          if (s.id === sessId) {
            s.palestrante  = vals.palestrante;
            s.status       = vals.status;
            s.empresa      = vals.empresa;
            s.tema         = vals.tema;
            s.bio          = vals.bio;
            s.linkedin     = vals.linkedin;
            s.fotoDataUrl  = vals.fotoDataUrl;
          }
        });
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

    var grid = el("div", "spk-grid");
    palcos.forEach(function (palco) {
      grid.appendChild(buildCard(palco, isMaster, onEdit, onSwap));
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
