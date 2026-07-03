/* ============================================================
   prospeccao.js — Módulo Prospecção de Palestrantes
   ------------------------------------------------------------
   Pipeline de candidatos a palestrante para o Summit 2026.
   Cada candidato tem: nome, foto (base64), cargo, empresa,
   linkedin, vídeo de referência, área de expertise, temas
   propostos, formato, disponibilidade, cachê, quem indicou,
   status no pipeline, avaliação do comitê (estrelas) e notas.

   Contrato consumido (window.Gestao):
     Gestao.data.prospeccao = { candidatos: [...] }
     Gestao.uid(prefix) · Gestao.save() · Gestao.onTab(id, fn)
     Gestao.pageHeader(opts) · Gestao.headerStat(opts)
     Gestao.readonly — true para perfil visualizador
   ============================================================ */

(function () {
  "use strict";

  var TAB_ID = "tab-prospeccao";

  /* ============================================================
     CSS do módulo (injetado uma única vez)
     ============================================================ */
  function ensureStyles() {
    if (document.getElementById("prosp-css")) return;
    var link = document.createElement("link");
    link.id = "prosp-css";
    link.rel = "stylesheet";
    link.href = "css/prospeccao.css?v=2";
    document.head.appendChild(link);
  }

  /* ============================================================
     Helpers de DOM — nunca innerHTML com dados do usuário
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

  function findIndex(arr, fn) {
    for (var i = 0; i < arr.length; i++) {
      if (fn(arr[i])) return i;
    }
    return -1;
  }

  /* Tamanho legível: 340 KB · 1.2 MB */
  function fmtSize(bytes) {
    var b = Number(bytes) || 0;
    if (b < 1024) return b + " B";
    if (b < 1024 * 1024) return Math.round(b / 1024) + " KB";
    return (b / (1024 * 1024)).toFixed(1) + " MB";
  }

  // Teto por anexo. O estado inteiro trafega num único PUT (ver server.js
  // BODY_LIMIT), então limitamos cada arquivo para não estourar o request.
  var MAX_ANEXO_BYTES = 2 * 1024 * 1024; // 2 MB

  /* ============================================================
     Configurações de domínio
     ============================================================ */
  var STATUS = {
    prospeccao: { label: "Em prospecção", cor: "#78716c" },
    contato:    { label: "Contato feito",  cor: "#2563eb" },
    aguardando: { label: "Aguardando",     cor: "#d97706" },
    aprovado:   { label: "Aprovado",       cor: "#16a34a" },
    recusado:   { label: "Recusado",       cor: "#dc2626" },
    confirmado: { label: "Confirmado",     cor: "#36177B" }
  };

  var STATUS_ORDER = ["prospeccao", "contato", "aguardando", "aprovado", "confirmado", "recusado"];

  var FORMATOS = {
    keynote:        "Keynote",
    sessao:         "Sessão",
    workshop:       "Workshop",
    "mesa-redonda": "Mesa-redonda"
  };

  /* ============================================================
     Acesso e inicialização dos dados
     ============================================================ */
  function getData() {
    var g = window.Gestao;
    if (!g) return { candidatos: [] };
    if (!g.data.prospeccao) g.data.prospeccao = { candidatos: [] };
    if (!Array.isArray(g.data.prospeccao.candidatos)) {
      g.data.prospeccao.candidatos = [];
    }
    return g.data.prospeccao;
  }

  /* ============================================================
     Estrelas estáticas (exibição nos cards)
     ============================================================ */
  function renderStarsStatic(rating) {
    var wrap = el("span", "prosp-stars");
    for (var i = 1; i <= 5; i++) {
      wrap.appendChild(el("span", i <= (rating || 0) ? "prosp-star filled" : "prosp-star", "★"));
    }
    return wrap;
  }

  /* ============================================================
     Iniciais do candidato (fallback quando não há foto)
     ============================================================ */
  function initials(nome) {
    return String(nome || "?")
      .split(" ")
      .slice(0, 2)
      .map(function (w) { return w[0] || ""; })
      .join("")
      .toUpperCase() || "?";
  }

  /* ============================================================
     Card de candidato (listagem)
     ============================================================ */
  function buildCard(c, onEdit) {
    var card = el("div", "prosp-card");

    /* Foto / iniciais */
    var photoWrap = el("div", "prosp-card__photo-wrap");
    if (c.foto) {
      var img = document.createElement("img");
      img.className = "prosp-card__photo";
      img.alt = c.nome || "Foto";
      img.src = c.foto;
      photoWrap.appendChild(img);
    } else {
      photoWrap.appendChild(el("div", "prosp-card__initials", initials(c.nome)));
    }
    card.appendChild(photoWrap);

    /* Corpo */
    var body = el("div", "prosp-card__body");

    var st = STATUS[c.status] || STATUS.prospeccao;
    var badge = el("span", "prosp-badge");
    badge.textContent = st.label;
    badge.style.background  = st.cor + "18";
    badge.style.color       = st.cor;
    badge.style.borderColor = st.cor + "40";
    body.appendChild(badge);

    body.appendChild(el("h3", "prosp-card__nome", c.nome || "—"));

    if (c.cargo || c.empresa) {
      body.appendChild(el("p", "prosp-card__empresa",
        [c.cargo, c.empresa].filter(Boolean).join(" · ")));
    }
    if (c.area) body.appendChild(el("p", "prosp-card__area", c.area));

    if (c.formato && FORMATOS[c.formato]) {
      body.appendChild(el("span", "prosp-badge prosp-badge--fmt", FORMATOS[c.formato]));
    }

    if (c.disponibilidade) {
      body.appendChild(el("p", "prosp-card__disp", "📅 " + c.disponibilidade));
    }

    body.appendChild(renderStarsStatic(c.avaliacaoComite));

    /* Links rápidos */
    if (c.linkedin || c.videoRef) {
      var linksRow = el("div", "prosp-card__links");
      if (c.linkedin) {
        var la = el("a", "prosp-link", "LinkedIn");
        la.href = c.linkedin;
        la.target = "_blank";
        la.rel = "noopener noreferrer";
        linksRow.appendChild(la);
      }
      if (c.videoRef) {
        var va = el("a", "prosp-link", "Vídeo");
        va.href = c.videoRef;
        va.target = "_blank";
        va.rel = "noopener noreferrer";
        linksRow.appendChild(va);
      }
      body.appendChild(linksRow);
    }

    /* Materiais anexados (CV, apresentação, etc.) — download direto */
    if (Array.isArray(c.anexos) && c.anexos.length) {
      var anexRow = el("div", "prosp-card__anexos");
      c.anexos.forEach(function (a) {
        var dl = el("a", "prosp-anexo-chip", "📎 " + (a.nome || "arquivo"));
        dl.href = a.data;
        dl.download = a.nome || "anexo";
        dl.title = "Baixar " + (a.nome || "arquivo") + (a.tamanho ? " (" + fmtSize(a.tamanho) + ")" : "");
        anexRow.appendChild(dl);
      });
      body.appendChild(anexRow);
    }

    card.appendChild(body);

    /* Botão editar — só no modo master */
    if (onEdit) {
      var btnEdit = el("button", "prosp-card__edit", "Editar");
      btnEdit.type = "button";
      btnEdit.addEventListener("click", function () { onEdit(c); });
      card.appendChild(btnEdit);
    }

    return card;
  }

  /* ============================================================
     Modal de adição / edição
     ============================================================ */
  function openModal(candidato, isNew, onSave, onDelete) {
    var c = candidato || {};

    var overlay = el("div", "prosp-overlay");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", isNew ? "Adicionar candidato" : "Editar candidato");

    var modal = el("div", "prosp-modal");

    /* Cabeçalho */
    var mHead = el("div", "prosp-modal__head");
    mHead.appendChild(el("h2", "prosp-modal__title", isNew ? "Novo Candidato" : "Editar Candidato"));
    var btnClose = el("button", "prosp-modal__close", "✕");
    btnClose.type = "button";
    btnClose.setAttribute("aria-label", "Fechar");
    mHead.appendChild(btnClose);
    modal.appendChild(mHead);

    /* Formulário */
    var form = el("form", "prosp-form");
    form.noValidate = true;

    /* -- Foto -- */
    var fotoState = { base64: c.foto || "" };
    var fotoSection = el("div", "prosp-form__foto-section");
    var fotoPreview = el("div", "prosp-photo-preview");

    var fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.style.display = "none";

    function updatePreview() {
      clear(fotoPreview);
      if (fotoState.base64) {
        var pImg = document.createElement("img");
        pImg.className = "prosp-photo-preview__img";
        pImg.src = fotoState.base64;
        pImg.alt = "Prévia";
        fotoPreview.appendChild(pImg);
        var btnRm = el("button", "prosp-photo-preview__remove", "✕ Remover");
        btnRm.type = "button";
        btnRm.addEventListener("click", function () {
          fotoState.base64 = "";
          fileInput.value = "";
          updatePreview();
        });
        fotoPreview.appendChild(btnRm);
        fotoPreview.style.cursor = "default";
      } else {
        var ph = el("div", "prosp-photo-preview__placeholder");
        ph.appendChild(el("span", "prosp-photo-preview__icon", "📷"));
        ph.appendChild(el("span", "prosp-photo-preview__hint", "Clique para adicionar foto"));
        fotoPreview.appendChild(ph);
        fotoPreview.style.cursor = "pointer";
      }
    }
    updatePreview();

    fotoPreview.addEventListener("click", function () {
      if (!fotoState.base64) fileInput.click();
    });

    fileInput.addEventListener("change", function () {
      var file = fileInput.files[0];
      if (!file) return;
      if (file.size > 500 * 1024) {
        var warn = el("p", "prosp-field__hint prosp-field__hint--error",
          "Foto muito grande (máx 500 KB). Redimensione a imagem antes de enviar.");
        fotoSection.appendChild(warn);
        fileInput.value = "";
        setTimeout(function () {
          if (warn.parentNode) warn.parentNode.removeChild(warn);
        }, 4000);
        return;
      }
      var reader = new FileReader();
      reader.onload = function (e) {
        fotoState.base64 = e.target.result;
        updatePreview();
      };
      reader.readAsDataURL(file);
    });

    var btnUpload = el("button", "btn sm prosp-upload-btn", "📂 Escolher foto");
    btnUpload.type = "button";
    btnUpload.addEventListener("click", function () { fileInput.click(); });

    fotoSection.appendChild(fotoPreview);
    fotoSection.appendChild(fileInput);
    fotoSection.appendChild(btnUpload);
    form.appendChild(fotoSection);

    /* -- Helpers de campo -- */
    function inp(val, placeholder, type) {
      var i = document.createElement("input");
      i.type = type || "text";
      i.className = "prosp-input";
      i.value = val || "";
      if (placeholder) i.placeholder = placeholder;
      return i;
    }

    function ta(val, placeholder, rows) {
      var t = document.createElement("textarea");
      t.className = "prosp-input prosp-textarea";
      t.value = val || "";
      if (placeholder) t.placeholder = placeholder;
      t.rows = rows || 3;
      return t;
    }

    function sel(opts, val) {
      var s = document.createElement("select");
      s.className = "prosp-input";
      opts.forEach(function (o) {
        var op = document.createElement("option");
        op.value = o.value;
        op.textContent = o.label;
        if (o.value === val) op.selected = true;
        s.appendChild(op);
      });
      return s;
    }

    function field(label, inputEl, hint, full) {
      var wrap = el("div", "prosp-field" + (full ? " prosp-field--full" : ""));
      var lbl = el("label", "prosp-field__label", label);
      wrap.appendChild(lbl);
      wrap.appendChild(inputEl);
      if (hint) wrap.appendChild(el("span", "prosp-field__hint", hint));
      return wrap;
    }

    /* -- Grid de 2 colunas -- */
    var grid = el("div", "prosp-form__grid");

    var inpNome     = inp(c.nome, "Nome completo");
    var inpCargo    = inp(c.cargo, "ex.: CEO, Gerente de Projetos");
    var inpEmpresa  = inp(c.empresa, "Nome da empresa / organização");
    var inpArea     = inp(c.area, "ex.: Agilidade, PMO, IA, Liderança");
    var inpLinkedin = inp(c.linkedin, "https://linkedin.com/in/...");
    var inpVideo    = inp(c.videoRef, "https://youtube.com/... (palestra anterior)");
    var inpDisp     = inp(c.disponibilidade, "ex.: 13 nov (manhã), ambos os dias");
    var inpCache    = inp(c.cache != null ? String(c.cache) : "", "0 = voluntário", "number");
    inpCache.min = "0";
    var inpIndicado = inp(c.indicadoPor, "Quem trouxe o nome");

    var selFormato = sel([
      { value: "keynote",       label: "Keynote" },
      { value: "sessao",        label: "Sessão" },
      { value: "workshop",      label: "Workshop" },
      { value: "mesa-redonda",  label: "Mesa-redonda" }
    ], c.formato || "sessao");

    var selStatus = sel(
      STATUS_ORDER.map(function (k) { return { value: k, label: STATUS[k].label }; }),
      c.status || "prospeccao"
    );

    grid.appendChild(field("Nome *", inpNome));
    grid.appendChild(field("Cargo", inpCargo));
    grid.appendChild(field("Empresa", inpEmpresa));
    grid.appendChild(field("Área de expertise", inpArea));
    grid.appendChild(field("LinkedIn", inpLinkedin));
    grid.appendChild(field("Vídeo de referência", inpVideo));
    grid.appendChild(field("Disponibilidade", inpDisp));
    grid.appendChild(field("Cachê estimado (R$)", inpCache, "Deixe vazio se voluntário"));
    grid.appendChild(field("Indicado por", inpIndicado));
    grid.appendChild(field("Formato", selFormato));
    grid.appendChild(field("Status", selStatus));

    form.appendChild(grid);

    /* -- Temas propostos (chips) -- */
    var temasState = Array.isArray(c.temasProposto) ? c.temasProposto.slice() : [];
    var temasWrap = el("div", "prosp-field prosp-field--full");
    temasWrap.appendChild(el("span", "prosp-field__label", "Temas propostos"));

    var chipsList = el("div", "prosp-chips");
    var temasInput = inp("", "Digite um tema e pressione Enter");
    temasInput.className = "prosp-input prosp-chips-input";

    function renderChips() {
      clear(chipsList);
      temasState.forEach(function (t, i) {
        var chip = el("span", "prosp-chip", t);
        var rm = el("button", "prosp-chip__rm", "×");
        rm.type = "button";
        rm.setAttribute("aria-label", "Remover " + t);
        (function (idx) {
          rm.addEventListener("click", function () {
            temasState.splice(idx, 1);
            renderChips();
          });
        })(i);
        chip.appendChild(rm);
        chipsList.appendChild(chip);
      });
    }
    renderChips();

    temasInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        var v = temasInput.value.trim();
        if (v && temasState.indexOf(v) === -1) {
          temasState.push(v);
          renderChips();
          temasInput.value = "";
        }
      }
    });

    temasWrap.appendChild(chipsList);
    temasWrap.appendChild(temasInput);
    temasWrap.appendChild(el("span", "prosp-field__hint", "Pressione Enter para adicionar cada tema"));
    form.appendChild(temasWrap);

    /* -- Avaliação do comitê (estrelas clicáveis) -- */
    var ratingState = { value: c.avaliacaoComite || 0 };
    var ratingWrap = el("div", "prosp-field prosp-field--full");
    ratingWrap.appendChild(el("span", "prosp-field__label", "Avaliação do comitê"));

    var starsEl = el("div", "prosp-stars-input");

    function renderStarsInput() {
      clear(starsEl);
      for (var i = 1; i <= 5; i++) {
        (function (star) {
          var s = el("button",
            "prosp-star-btn" + (star <= ratingState.value ? " filled" : ""), "★");
          s.type = "button";
          s.setAttribute("aria-label", star + " estrela" + (star > 1 ? "s" : ""));
          s.addEventListener("click", function () {
            ratingState.value = ratingState.value === star ? 0 : star;
            renderStarsInput();
          });
          starsEl.appendChild(s);
        })(i);
      }
      starsEl.appendChild(el("span", "prosp-stars-value",
        ratingState.value ? ratingState.value + "/5" : "Sem avaliação"));
    }
    renderStarsInput();
    ratingWrap.appendChild(starsEl);
    form.appendChild(ratingWrap);

    /* -- Notas internas -- */
    var taNotas = ta(c.notas,
      "Histórico de contato, observações, links adicionais…", 4);
    form.appendChild(field("Notas internas", taNotas, null, true));

    /* -- Anexos do palestrante (PDF, CV, apresentação, etc.) -- */
    var anexosState = Array.isArray(c.anexos) ? c.anexos.slice() : [];
    var anexSection = el("div", "prosp-field prosp-field--full");
    anexSection.appendChild(el("span", "prosp-field__label", "Anexos do palestrante"));

    var anexList  = el("div", "prosp-anexos-list");
    var anexError = el("p", "prosp-field__hint prosp-field__hint--error");
    anexError.style.display = "none";

    var anexInput = document.createElement("input");
    anexInput.type = "file";
    anexInput.accept = ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,image/*";
    anexInput.multiple = true;
    anexInput.style.display = "none";

    function renderAnexos() {
      clear(anexList);
      if (!anexosState.length) {
        anexList.appendChild(el("p", "prosp-anexos-empty",
          "Nenhum anexo. Ex.: currículo, portfólio, proposta, apresentação."));
        return;
      }
      anexosState.forEach(function (a, i) {
        var item = el("div", "prosp-anexo-item");

        var dl = el("a", "prosp-anexo-item__name", "📎 " + (a.nome || "arquivo"));
        dl.href = a.data;
        dl.download = a.nome || "anexo";
        dl.title = "Baixar";
        item.appendChild(dl);

        if (a.tamanho) {
          item.appendChild(el("span", "prosp-anexo-item__size", fmtSize(a.tamanho)));
        }

        var rm = el("button", "prosp-anexo-item__rm", "✕");
        rm.type = "button";
        rm.setAttribute("aria-label", "Remover anexo " + (a.nome || ""));
        (function (idx) {
          rm.addEventListener("click", function () {
            anexosState.splice(idx, 1);
            renderAnexos();
          });
        })(i);
        item.appendChild(rm);

        anexList.appendChild(item);
      });
    }
    renderAnexos();

    function showAnexError(msg) {
      anexError.textContent = msg;
      anexError.style.display = "block";
      setTimeout(function () { anexError.style.display = "none"; }, 4500);
    }

    anexInput.addEventListener("change", function () {
      var files = Array.prototype.slice.call(anexInput.files || []);
      files.forEach(function (file) {
        if (file.size > MAX_ANEXO_BYTES) {
          showAnexError("“" + file.name + "” tem " + fmtSize(file.size) +
            " (máx 2 MB). Comprima o arquivo antes de anexar.");
          return;
        }
        var reader = new FileReader();
        reader.onload = function (e) {
          anexosState.push({
            id:      window.Gestao ? window.Gestao.uid("anx") : "anx-" + Date.now(),
            nome:    file.name,
            tipo:    file.type || "",
            tamanho: file.size,
            data:    e.target.result
          });
          renderAnexos();
        };
        reader.readAsDataURL(file);
      });
      anexInput.value = "";
    });

    var btnAnex = el("button", "btn sm prosp-upload-btn", "📎 Anexar arquivo");
    btnAnex.type = "button";
    btnAnex.addEventListener("click", function () { anexInput.click(); });

    anexSection.appendChild(anexList);
    anexSection.appendChild(anexInput);
    anexSection.appendChild(btnAnex);
    anexSection.appendChild(anexError);
    anexSection.appendChild(el("span", "prosp-field__hint",
      "PDF, Word, PowerPoint, Excel ou imagem · até 2 MB por arquivo"));
    form.appendChild(anexSection);

    modal.appendChild(form);

    /* -- Ações do modal -- */
    var actions = el("div", "prosp-modal__actions");

    var btnSave = el("button", "btn btn-primary", "Salvar");
    btnSave.type = "button";
    btnSave.addEventListener("click", function () {
      var nome = inpNome.value.trim();
      if (!nome) {
        inpNome.focus();
        inpNome.classList.add("prosp-input--error");
        return;
      }
      inpNome.classList.remove("prosp-input--error");

      var cacheRaw = inpCache.value.trim();
      var cacheNum = cacheRaw === "" ? null : parseFloat(cacheRaw);

      onSave({
        id:              c.id || (window.Gestao ? window.Gestao.uid("pc") : "pc-" + Date.now()),
        nome:            nome,
        foto:            fotoState.base64,
        cargo:           inpCargo.value.trim(),
        empresa:         inpEmpresa.value.trim(),
        area:            inpArea.value.trim(),
        linkedin:        inpLinkedin.value.trim(),
        videoRef:        inpVideo.value.trim(),
        disponibilidade: inpDisp.value.trim(),
        cache:           (cacheNum === null || isNaN(cacheNum)) ? null : cacheNum,
        indicadoPor:     inpIndicado.value.trim(),
        formato:         selFormato.value,
        status:          selStatus.value,
        temasProposto:   temasState.slice(),
        avaliacaoComite: ratingState.value,
        notas:           taNotas.value.trim(),
        anexos:          anexosState.slice(),
        dataCriacao:     c.dataCriacao || new Date().toISOString().slice(0, 10)
      });
      document.body.removeChild(overlay);
    });
    actions.appendChild(btnSave);

    /* Exclusão com confirmação inline (sem dialog do browser) */
    if (!isNew && onDelete) {
      var confirmPending = false;
      var btnDel = el("button", "btn btn-danger", "Excluir");
      btnDel.type = "button";
      btnDel.addEventListener("click", function () {
        if (!confirmPending) {
          confirmPending = true;
          btnDel.textContent = "⚠️ Confirmar exclusão?";
          btnDel.classList.add("btn-danger--confirm");
          setTimeout(function () {
            if (confirmPending) {
              confirmPending = false;
              btnDel.textContent = "Excluir";
              btnDel.classList.remove("btn-danger--confirm");
            }
          }, 3000);
        } else {
          if (window.Gestao) window.Gestao.toast("Candidato removido");
          onDelete(c.id);
          document.body.removeChild(overlay);
        }
      });
      actions.appendChild(btnDel);
    }

    var btnCancel = el("button", "btn", "Cancelar");
    btnCancel.type = "button";
    btnCancel.addEventListener("click", function () { document.body.removeChild(overlay); });
    actions.appendChild(btnCancel);

    modal.appendChild(actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    btnClose.addEventListener("click", function () { document.body.removeChild(overlay); });
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) document.body.removeChild(overlay);
    });

    setTimeout(function () { inpNome.focus(); }, 60);
  }

  /* ============================================================
     Vista para o comitê (impressão / PDF)
     ============================================================ */
  function openComiteView(candidatos) {
    var overlay = el("div", "prosp-overlay prosp-comite-overlay");
    var modal   = el("div", "prosp-comite-modal");

    var head = el("div", "prosp-comite-modal__head");
    head.appendChild(el("h2", "prosp-comite-modal__title",
      "Prospecção de Palestrantes — Summit POA 2026"));
    head.appendChild(el("p", "prosp-comite-modal__sub",
      "Lista de candidatos para apreciação do comitê · PMI-RS"));

    var actHead = el("div", "prosp-comite-modal__actions");
    var btnPrint = el("button", "btn btn-primary sm", "🖨️ Imprimir / Salvar PDF");
    btnPrint.type = "button";
    btnPrint.addEventListener("click", function () { window.print(); });
    actHead.appendChild(btnPrint);

    var btnClose = el("button", "btn sm", "Fechar");
    btnClose.type = "button";
    btnClose.addEventListener("click", function () { document.body.removeChild(overlay); });
    actHead.appendChild(btnClose);

    head.appendChild(actHead);
    modal.appendChild(head);

    var ativos = candidatos.filter(function (c) { return c.status !== "recusado"; });

    if (!ativos.length) {
      modal.appendChild(el("p", "prosp-empty", "Nenhum candidato ativo no momento."));
    }

    ativos.forEach(function (c) {
      var card  = el("div", "prosp-comite-card");
      var left  = el("div", "prosp-comite-card__left");

      if (c.foto) {
        var img = document.createElement("img");
        img.className = "prosp-comite-card__photo";
        img.src = c.foto;
        img.alt = c.nome || "";
        left.appendChild(img);
      } else {
        left.appendChild(el("div", "prosp-comite-card__initials", initials(c.nome)));
      }
      left.appendChild(renderStarsStatic(c.avaliacaoComite));
      card.appendChild(left);

      var right = el("div", "prosp-comite-card__right");

      var st    = STATUS[c.status] || STATUS.prospeccao;
      var badge = el("span", "prosp-badge");
      badge.textContent   = st.label;
      badge.style.background  = st.cor + "18";
      badge.style.color       = st.cor;
      badge.style.borderColor = st.cor + "40";
      right.appendChild(badge);

      right.appendChild(el("h3", "prosp-comite-card__nome", c.nome || "—"));

      if (c.cargo || c.empresa) {
        right.appendChild(el("p", "prosp-comite-card__empresa",
          [c.cargo, c.empresa].filter(Boolean).join(" · ")));
      }
      if (c.area)           right.appendChild(el("p", "prosp-comite-card__detail", "Área: " + c.area));
      if (c.formato)        right.appendChild(el("p", "prosp-comite-card__detail",
        "Formato: " + (FORMATOS[c.formato] || c.formato)));
      if (c.disponibilidade) right.appendChild(el("p", "prosp-comite-card__detail",
        "Disponibilidade: " + c.disponibilidade));
      if (c.cache != null)  right.appendChild(el("p", "prosp-comite-card__detail",
        "Cachê: " + (c.cache === 0 ? "Voluntário" : "R$ " + Number(c.cache).toLocaleString("pt-BR"))));
      if (c.indicadoPor)    right.appendChild(el("p", "prosp-comite-card__detail",
        "Indicado por: " + c.indicadoPor));

      if (Array.isArray(c.temasProposto) && c.temasProposto.length) {
        var temasEl = el("div", "prosp-comite-card__temas");
        temasEl.appendChild(el("span", "prosp-comite-card__temas-lbl", "Temas propostos:"));
        c.temasProposto.forEach(function (t) {
          temasEl.appendChild(el("span", "prosp-chip", t));
        });
        right.appendChild(temasEl);
      }

      if (c.notas) {
        var notasEl = el("div", "prosp-comite-card__notas");
        notasEl.appendChild(el("strong", "", "Notas: "));
        notasEl.appendChild(document.createTextNode(c.notas));
        right.appendChild(notasEl);
      }

      if (c.linkedin || c.videoRef) {
        var linksEl = el("div", "prosp-comite-card__links");
        if (c.linkedin) {
          var la = el("a", "prosp-link", "LinkedIn");
          la.href = c.linkedin; la.target = "_blank"; la.rel = "noopener noreferrer";
          linksEl.appendChild(la);
        }
        if (c.videoRef) {
          var va = el("a", "prosp-link", "Ver vídeo");
          va.href = c.videoRef; va.target = "_blank"; va.rel = "noopener noreferrer";
          linksEl.appendChild(va);
        }
        right.appendChild(linksEl);
      }

      if (Array.isArray(c.anexos) && c.anexos.length) {
        var matEl = el("div", "prosp-comite-card__links");
        matEl.appendChild(el("span", "prosp-comite-card__temas-lbl", "Materiais:"));
        c.anexos.forEach(function (a) {
          var dl = el("a", "prosp-link", "📎 " + (a.nome || "arquivo"));
          dl.href = a.data;
          dl.download = a.nome || "anexo";
          matEl.appendChild(dl);
        });
        right.appendChild(matEl);
      }

      card.appendChild(right);
      modal.appendChild(card);
    });

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) document.body.removeChild(overlay);
    });
  }

  /* ============================================================
     Renderer principal
     ============================================================ */
  function render(mount, data) {
    ensureStyles();
    clear(mount);

    var prosp      = getData();
    var candidatos = prosp.candidatos;
    var readonly   = !!(window.Gestao && window.Gestao.readonly);
    var filtroAtivo = mount._filtroProsp || "todos";

    function salvarERender(toastMsg) {
      if (window.Gestao) window.Gestao.save();
      render(mount, data);
      if (toastMsg && window.Gestao) window.Gestao.toast(toastMsg);
    }

    function openNewForm() {
      openModal(null, true, function (novo) {
        candidatos.push(novo);
        salvarERender("Candidato salvo");
      }, null);
    }

    /* Cabeçalho */
    var ativos    = candidatos.filter(function (c) { return c.status !== "recusado"; }).length;
    var aprovados = candidatos.filter(function (c) {
      return c.status === "aprovado" || c.status === "confirmado";
    }).length;

    var statCard = window.Gestao ? window.Gestao.headerStat({
      label:  "Candidatos",
      value:  String(candidatos.length),
      sub:    aprovados + " aprovado(s)",
      accent: true
    }) : null;

    mount.appendChild(
      window.Gestao ? window.Gestao.pageHeader({
        eyebrow:  "SUMMIT POA PMIRS 2026",
        title:    "Prospecção de Palestrantes",
        subtitle: "Pipeline de candidatos · " + ativos + " ativo(s)",
        right:    statCard
      }) : el("h2", "", "Prospecção de Palestrantes")
    );

    /* Toolbar */
    var toolbar = el("div", "prosp-toolbar");

    var filterBar = el("div", "prosp-filters");
    var allFilters = [{ key: "todos", label: "Todos (" + candidatos.length + ")" }].concat(
      STATUS_ORDER.map(function (k) {
        var count = candidatos.filter(function (c) { return c.status === k; }).length;
        return { key: k, label: STATUS[k].label + " (" + count + ")" };
      })
    );
    allFilters.forEach(function (f) {
      var btn = el("button",
        "prosp-filter-btn" + (filtroAtivo === f.key ? " active" : ""), f.label);
      btn.type = "button";
      btn.addEventListener("click", function () {
        mount._filtroProsp = f.key;
        render(mount, data);
      });
      filterBar.appendChild(btn);
    });
    toolbar.appendChild(filterBar);

    var toolbarRight = el("div", "prosp-toolbar__right");
    if (candidatos.length > 0) {
      var btnComite = el("button", "btn sm", "📋 Vista p/ Comitê");
      btnComite.type = "button";
      btnComite.addEventListener("click", function () { openComiteView(candidatos); });
      toolbarRight.appendChild(btnComite);
    }
    if (!readonly) {
      var btnAdd = el("button", "btn btn-primary sm", "+ Adicionar Candidato");
      btnAdd.type = "button";
      btnAdd.addEventListener("click", function () { openNewForm(); });
      toolbarRight.appendChild(btnAdd);
    }
    toolbar.appendChild(toolbarRight);
    mount.appendChild(toolbar);

    /* Grid */
    var filtrados = filtroAtivo === "todos"
      ? candidatos
      : candidatos.filter(function (c) { return c.status === filtroAtivo; });

    if (!filtrados.length) {
      var emptyEl;
      if (!candidatos.length) {
        emptyEl = window.Gestao
          ? window.Gestao.emptyState(
              "Nenhum candidato cadastrado.",
              !readonly ? "+ Candidato" : null,
              !readonly ? openNewForm : null
            )
          : el("p", "prosp-empty__title", "Nenhum candidato cadastrado.");
      } else {
        emptyEl = window.Gestao
          ? window.Gestao.emptyState("Nenhum candidato com este status.")
          : el("p", "prosp-empty__title", "Nenhum candidato com este status.");
      }
      mount.appendChild(emptyEl);
      return;
    }

    var grid = el("div", "prosp-grid");
    filtrados.forEach(function (c) {
      var onEdit = readonly ? null : function (cand) {
        var idx = findIndex(candidatos, function (x) { return x.id === cand.id; });
        openModal(cand, false, function (updated) {
          if (idx >= 0) candidatos[idx] = updated;
          salvarERender("Candidato salvo");
        }, function (id) {
          var di = findIndex(candidatos, function (x) { return x.id === id; });
          if (di >= 0) candidatos.splice(di, 1);
          salvarERender();
        });
      };
      grid.appendChild(buildCard(c, onEdit));
    });
    mount.appendChild(grid);
  }

  /* ============================================================
     Registro da aba
     ============================================================ */
  function register() {
    window.Gestao.onTab(TAB_ID, render);
  }

  if (window.Gestao) {
    register();
  } else {
    document.addEventListener("gestao:ready", register);
  }
})();
