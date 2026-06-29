/* ============================================================
   patrocinio.js — Módulo Prospecção de Patrocínio
   ------------------------------------------------------------
   Pipeline de empresas patrocinadores para o Summit 2026.
   Cada patrocinador tem: nome, logo, setor, contato, cota,
   valor, status, responsável da equipe, benefícios acordados,
   interesse estimado e notas internas.

   Contrato consumido (window.Gestao):
     Gestao.data.patrocinio = { patrocinadores: [] }
     Gestao.uid(prefix) · Gestao.save() · Gestao.onTab(id, fn)
     Gestao.pageHeader(opts) · Gestao.headerStat(opts)
     Gestao.readonly — true para perfil visualizador
   ============================================================ */

(function () {
  "use strict";

  var TAB_ID = "tab-patrocinio";

  /* ============================================================
     CSS do módulo (injetado uma única vez)
     ============================================================ */
  function ensureStyles() {
    if (!document.getElementById("prosp-css")) {
      var l1 = document.createElement("link");
      l1.id = "prosp-css"; l1.rel = "stylesheet"; l1.href = "css/prospeccao.css";
      document.head.appendChild(l1);
    }
    if (!document.getElementById("patr-css")) {
      var l2 = document.createElement("link");
      l2.id = "patr-css"; l2.rel = "stylesheet"; l2.href = "css/patrocinio.css";
      document.head.appendChild(l2);
    }
  }

  /* ============================================================
     Helpers de DOM
     ============================================================ */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function findIndex(arr, fn) {
    for (var i = 0; i < arr.length; i++) { if (fn(arr[i])) return i; }
    return -1;
  }

  /* ============================================================
     Domínio
     ============================================================ */
  var STATUS = {
    prospeccao: { label: "Em prospecção",    cor: "#78716c" },
    contato:    { label: "Contato feito",    cor: "#2563eb" },
    proposta:   { label: "Proposta enviada", cor: "#d97706" },
    aguardando: { label: "Aguardando",       cor: "#ca8a04" },
    aprovado:   { label: "Aprovado",         cor: "#16a34a" },
    confirmado: { label: "Confirmado",       cor: "#36177B" },
    recusado:   { label: "Recusado",         cor: "#dc2626" }
  };

  var STATUS_ORDER = ["prospeccao", "contato", "proposta", "aguardando", "aprovado", "confirmado", "recusado"];

  var COTAS = {
    diamante:  { label: "Diamante",  cor: "#0284c7" },
    ouro:      { label: "Ouro",      cor: "#d97706" },
    prata:     { label: "Prata",     cor: "#64748b" },
    bronze:    { label: "Bronze",    cor: "#b45309" },
    apoiador:  { label: "Apoiador",  cor: "#6b7280" }
  };

  var COTA_ORDER = ["diamante", "ouro", "prata", "bronze", "apoiador"];

  /* ============================================================
     Dados
     ============================================================ */
  function getData() {
    var g = window.Gestao;
    if (!g) return { patrocinadores: [] };
    if (!g.data.patrocinio) g.data.patrocinio = { patrocinadores: [] };
    if (!Array.isArray(g.data.patrocinio.patrocinadores)) {
      g.data.patrocinio.patrocinadores = [];
    }
    return g.data.patrocinio;
  }

  /* ============================================================
     Helpers visuais
     ============================================================ */
  function renderStarsStatic(rating) {
    var wrap = el("span", "prosp-stars");
    for (var i = 1; i <= 5; i++) {
      wrap.appendChild(el("span", i <= (rating || 0) ? "prosp-star filled" : "prosp-star", "★"));
    }
    return wrap;
  }

  function initials(nome) {
    return String(nome || "?")
      .split(/[\s&]+/)
      .slice(0, 2)
      .map(function (w) { return w[0] || ""; })
      .join("")
      .toUpperCase() || "?";
  }

  function cotaBadge(cota) {
    var info = COTAS[cota];
    if (!info) return null;
    var b = el("span", "prosp-badge patr-badge--cota");
    b.textContent = info.label;
    b.style.background  = info.cor + "18";
    b.style.color       = info.cor;
    b.style.borderColor = info.cor + "40";
    return b;
  }

  function fmtBRL(v) {
    if (v == null || v === "" || v === 0) return "";
    return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  /* ============================================================
     Card de patrocinador
     ============================================================ */
  function buildCard(p, onEdit) {
    var card = el("div", "prosp-card patr-card");

    /* Logo */
    var logoWrap = el("div", "patr-card__logo-wrap");
    if (p.logo) {
      var img = document.createElement("img");
      img.className = "patr-card__logo";
      img.alt = p.nome || "Logo";
      img.src = p.logo;
      logoWrap.appendChild(img);
    } else {
      logoWrap.appendChild(el("div", "patr-card__initials", initials(p.nome)));
    }
    card.appendChild(logoWrap);

    /* Corpo */
    var body = el("div", "prosp-card__body");

    var st = STATUS[p.status] || STATUS.prospeccao;
    var stBadge = el("span", "prosp-badge");
    stBadge.textContent = st.label;
    stBadge.style.background  = st.cor + "18";
    stBadge.style.color       = st.cor;
    stBadge.style.borderColor = st.cor + "40";
    body.appendChild(stBadge);

    body.appendChild(el("h3", "prosp-card__nome", p.nome || "—"));

    if (p.setor) body.appendChild(el("p", "prosp-card__area", p.setor));

    if (p.contato || p.cargoContato) {
      body.appendChild(el("p", "prosp-card__empresa",
        [p.contato, p.cargoContato].filter(Boolean).join(" · ")));
    }

    if (p.cota) {
      var cb = cotaBadge(p.cota);
      if (cb) body.appendChild(cb);
    }

    if (p.valor) body.appendChild(el("p", "patr-card__valor", fmtBRL(p.valor)));

    body.appendChild(renderStarsStatic(p.interesse));

    var hasLinks = p.email || p.telefone || p.site;
    if (hasLinks) {
      var linksRow = el("div", "prosp-card__links");
      if (p.site) {
        var sa = el("a", "prosp-link", "Site");
        sa.href = p.site; sa.target = "_blank"; sa.rel = "noopener noreferrer";
        linksRow.appendChild(sa);
      }
      if (p.email) {
        var ea = el("a", "prosp-link", "E-mail");
        ea.href = "mailto:" + p.email;
        linksRow.appendChild(ea);
      }
      if (p.telefone) {
        var ta = el("a", "prosp-link", p.telefone);
        ta.href = "tel:" + p.telefone.replace(/\D/g, "");
        linksRow.appendChild(ta);
      }
      body.appendChild(linksRow);
    }

    card.appendChild(body);

    if (onEdit) {
      var btnEdit = el("button", "prosp-card__edit", "Editar");
      btnEdit.type = "button";
      btnEdit.addEventListener("click", function () { onEdit(p); });
      card.appendChild(btnEdit);
    }

    return card;
  }

  /* ============================================================
     Modal de adição / edição
     ============================================================ */
  function openModal(patrocinador, isNew, onSave, onDelete) {
    var p = patrocinador || {};

    var overlay = el("div", "prosp-overlay");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", isNew ? "Adicionar patrocinador" : "Editar patrocinador");

    var modal = el("div", "prosp-modal");

    var mHead = el("div", "prosp-modal__head");
    mHead.appendChild(el("h2", "prosp-modal__title",
      isNew ? "Novo Patrocinador" : "Editar Patrocinador"));
    var btnClose = el("button", "prosp-modal__close", "✕");
    btnClose.type = "button";
    btnClose.setAttribute("aria-label", "Fechar");
    mHead.appendChild(btnClose);
    modal.appendChild(mHead);

    var form = el("form", "prosp-form");
    form.noValidate = true;

    /* -- Logo -- */
    var logoState = { base64: p.logo || "" };
    var logoSection = el("div", "prosp-form__foto-section");
    var logoPreview = el("div", "prosp-photo-preview patr-logo-preview");

    var fileInput = document.createElement("input");
    fileInput.type = "file"; fileInput.accept = "image/*"; fileInput.style.display = "none";

    function updateLogoPreview() {
      clear(logoPreview);
      if (logoState.base64) {
        var pImg = document.createElement("img");
        pImg.className = "prosp-photo-preview__img";
        pImg.src = logoState.base64; pImg.alt = "Logo";
        pImg.style.objectFit = "contain"; pImg.style.padding = "4px";
        logoPreview.appendChild(pImg);
        var btnRm = el("button", "prosp-photo-preview__remove", "✕ Remover");
        btnRm.type = "button";
        btnRm.addEventListener("click", function () {
          logoState.base64 = ""; fileInput.value = ""; updateLogoPreview();
        });
        logoPreview.appendChild(btnRm);
        logoPreview.style.cursor = "default";
      } else {
        var ph = el("div", "prosp-photo-preview__placeholder");
        ph.appendChild(el("span", "prosp-photo-preview__icon", "🏢"));
        ph.appendChild(el("span", "prosp-photo-preview__hint", "Logo da empresa"));
        logoPreview.appendChild(ph);
        logoPreview.style.cursor = "pointer";
      }
    }
    updateLogoPreview();

    logoPreview.addEventListener("click", function () { if (!logoState.base64) fileInput.click(); });
    fileInput.addEventListener("change", function () {
      var file = fileInput.files[0];
      if (!file) return;
      if (file.size > 500 * 1024) {
        window.Gestao && window.Gestao.toast("Logo muito grande (max 500 KB)", "error");
        fileInput.value = ""; return;
      }
      var reader = new FileReader();
      reader.onload = function (e) { logoState.base64 = e.target.result; updateLogoPreview(); };
      reader.readAsDataURL(file);
    });

    var btnUpload = el("button", "btn sm prosp-upload-btn", "📂 Escolher logo");
    btnUpload.type = "button";
    btnUpload.addEventListener("click", function () { fileInput.click(); });
    logoSection.appendChild(logoPreview);
    logoSection.appendChild(fileInput);
    logoSection.appendChild(btnUpload);
    form.appendChild(logoSection);

    /* -- Helpers de campo -- */
    function inp(val, placeholder, type) {
      var i = document.createElement("input");
      i.type = type || "text"; i.className = "prosp-input"; i.value = val || "";
      if (placeholder) i.placeholder = placeholder;
      return i;
    }
    function taEl(val, placeholder, rows) {
      var t = document.createElement("textarea");
      t.className = "prosp-input prosp-textarea"; t.value = val || ""; t.rows = rows || 3;
      if (placeholder) t.placeholder = placeholder;
      return t;
    }
    function sel(opts, val) {
      var s = document.createElement("select"); s.className = "prosp-input";
      opts.forEach(function (o) {
        var op = document.createElement("option");
        op.value = o.value; op.textContent = o.label;
        if (o.value === val) op.selected = true;
        s.appendChild(op);
      });
      return s;
    }
    function field(label, inputEl, hint, full) {
      var wrap = el("div", "prosp-field" + (full ? " prosp-field--full" : ""));
      wrap.appendChild(el("label", "prosp-field__label", label));
      wrap.appendChild(inputEl);
      if (hint) wrap.appendChild(el("span", "prosp-field__hint", hint));
      return wrap;
    }

    var grid = el("div", "prosp-form__grid");

    var inpNome     = inp(p.nome, "Nome da empresa");
    var inpSetor    = inp(p.setor, "ex.: Tecnologia, Consultoria, Saude");
    var inpContato  = inp(p.contato, "Nome do contato");
    var inpCargo    = inp(p.cargoContato, "Cargo do contato");
    var inpEmail    = inp(p.email, "email@empresa.com.br", "email");
    var inpTel      = inp(p.telefone, "(51) 99999-9999");
    var inpSite     = inp(p.site, "https://empresa.com.br");
    var inpValor    = inp(p.valor ? String(p.valor) : "", "0", "number");
    inpValor.min    = "0";
    var inpResp     = inp(p.responsavel, "Membro da equipe responsavel");

    var selCota   = sel(COTA_ORDER.map(function (k) { return { value: k, label: COTAS[k].label }; }), p.cota || "ouro");
    var selStatus = sel(STATUS_ORDER.map(function (k) { return { value: k, label: STATUS[k].label }; }), p.status || "prospeccao");

    grid.appendChild(field("Empresa *", inpNome));
    grid.appendChild(field("Setor / Segmento", inpSetor));
    grid.appendChild(field("Contato (pessoa)", inpContato));
    grid.appendChild(field("Cargo do contato", inpCargo));
    grid.appendChild(field("E-mail", inpEmail));
    grid.appendChild(field("Telefone", inpTel));
    grid.appendChild(field("Site / URL", inpSite));
    grid.appendChild(field("Valor proposto (R$)", inpValor, "Deixe 0 se ainda nao definido"));
    grid.appendChild(field("Cota", selCota));
    grid.appendChild(field("Responsavel (equipe)", inpResp));
    grid.appendChild(field("Status", selStatus));
    form.appendChild(grid);

    /* -- Beneficios chips -- */
    var benefState = Array.isArray(p.beneficios) ? p.beneficios.slice() : [];
    var benefWrap  = el("div", "prosp-field prosp-field--full");
    benefWrap.appendChild(el("span", "prosp-field__label", "Beneficios / Contrapartidas"));
    var chipsList  = el("div", "prosp-chips");
    var benefInput = inp("", "ex.: Stand 3x3, Banner digital, 5 ingressos VIP");
    benefInput.className = "prosp-input prosp-chips-input";

    function renderChips() {
      clear(chipsList);
      benefState.forEach(function (t, i) {
        var chip = el("span", "prosp-chip", t);
        var rm   = el("button", "prosp-chip__rm", "\xD7");
        rm.type  = "button";
        rm.setAttribute("aria-label", "Remover " + t);
        (function (idx) {
          rm.addEventListener("click", function () { benefState.splice(idx, 1); renderChips(); });
        })(i);
        chip.appendChild(rm);
        chipsList.appendChild(chip);
      });
    }
    renderChips();

    benefInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        var v = benefInput.value.trim();
        if (v && benefState.indexOf(v) === -1) {
          benefState.push(v); renderChips(); benefInput.value = "";
        }
      }
    });

    benefWrap.appendChild(chipsList);
    benefWrap.appendChild(benefInput);
    benefWrap.appendChild(el("span", "prosp-field__hint", "Pressione Enter para adicionar cada beneficio"));
    form.appendChild(benefWrap);

    /* -- Interesse (estrelas) -- */
    var ratingState = { value: p.interesse || 0 };
    var ratingWrap  = el("div", "prosp-field prosp-field--full");
    ratingWrap.appendChild(el("span", "prosp-field__label", "Interesse estimado"));
    var starsEl = el("div", "prosp-stars-input");

    function renderStarsInput() {
      clear(starsEl);
      for (var i = 1; i <= 5; i++) {
        (function (star) {
          var s = el("button", "prosp-star-btn" + (star <= ratingState.value ? " filled" : ""), "★");
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
        ratingState.value ? ratingState.value + "/5" : "Sem avaliacao"));
    }
    renderStarsInput();
    ratingWrap.appendChild(starsEl);
    form.appendChild(ratingWrap);

    /* -- Notas -- */
    var taNotas = taEl(p.notas, "Historico de contato, observacoes...", 4);
    form.appendChild(field("Notas internas", taNotas, null, true));

    modal.appendChild(form);

    /* -- Acoes -- */
    var actions = el("div", "prosp-modal__actions");

    var btnSave = el("button", "btn btn-primary", "Salvar");
    btnSave.type = "button";
    btnSave.addEventListener("click", function () {
      var nome = inpNome.value.trim();
      if (!nome) { inpNome.focus(); inpNome.classList.add("prosp-input--error"); return; }
      inpNome.classList.remove("prosp-input--error");
      var valorRaw = inpValor.value.trim();
      var valorNum = valorRaw === "" ? 0 : parseFloat(valorRaw);
      onSave({
        id:           p.id || (window.Gestao ? window.Gestao.uid("pat") : "pat-" + Date.now()),
        nome:         nome,
        logo:         logoState.base64,
        setor:        inpSetor.value.trim(),
        contato:      inpContato.value.trim(),
        cargoContato: inpCargo.value.trim(),
        email:        inpEmail.value.trim(),
        telefone:     inpTel.value.trim(),
        site:         inpSite.value.trim(),
        valor:        isNaN(valorNum) ? 0 : valorNum,
        cota:         selCota.value,
        responsavel:  inpResp.value.trim(),
        status:       selStatus.value,
        beneficios:   benefState.slice(),
        interesse:    ratingState.value,
        notas:        taNotas.value.trim(),
        dataCriacao:  p.dataCriacao || new Date().toISOString().slice(0, 10)
      });
      document.body.removeChild(overlay);
    });
    actions.appendChild(btnSave);

    if (!isNew && onDelete) {
      var confirmPending = false;
      var btnDel = el("button", "btn btn-danger", "Excluir");
      btnDel.type = "button";
      btnDel.addEventListener("click", function () {
        if (!confirmPending) {
          confirmPending = true;
          btnDel.textContent = "⚠️ Confirmar exclusao?";
          btnDel.classList.add("btn-danger--confirm");
          setTimeout(function () {
            if (confirmPending) {
              confirmPending = false;
              btnDel.textContent = "Excluir";
              btnDel.classList.remove("btn-danger--confirm");
            }
          }, 3000);
        } else {
          window.Gestao && window.Gestao.toast("Patrocinador removido");
          onDelete(p.id);
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
     Vista para apresentação / impressão
     ============================================================ */
  function openVistaView(lista) {
    var overlay = el("div", "prosp-overlay prosp-comite-overlay");
    var modal   = el("div", "prosp-comite-modal");

    var head = el("div", "prosp-comite-modal__head");
    head.appendChild(el("h2", "prosp-comite-modal__title",
      "Patrocinadores — Summit POA PMIRS 2026"));
    head.appendChild(el("p", "prosp-comite-modal__sub",
      "Pipeline de patrocínio para apreciação do comitê · PMI-RS"));

    var actHead = el("div", "prosp-comite-modal__actions");
    var btnPrint = el("button", "btn btn-primary sm", "🖨 Imprimir / Salvar PDF");
    btnPrint.type = "button";
    btnPrint.addEventListener("click", function () { window.print(); });
    actHead.appendChild(btnPrint);
    var btnClose = el("button", "btn sm", "Fechar");
    btnClose.type = "button";
    btnClose.addEventListener("click", function () { document.body.removeChild(overlay); });
    actHead.appendChild(btnClose);
    head.appendChild(actHead);
    modal.appendChild(head);

    var ativos = lista.filter(function (p) { return p.status !== "recusado"; });

    if (!ativos.length) {
      modal.appendChild(el("p", "prosp-empty", "Nenhum patrocinador ativo."));
    }

    ativos.forEach(function (p) {
      var card = el("div", "prosp-comite-card");
      var left = el("div", "prosp-comite-card__left patr-vista-logo-wrap");

      if (p.logo) {
        var img = document.createElement("img");
        img.className = "patr-vista-logo";
        img.src = p.logo; img.alt = p.nome || "";
        left.appendChild(img);
      } else {
        left.appendChild(el("div", "prosp-comite-card__initials", initials(p.nome)));
      }
      if (p.cota) { var cb = cotaBadge(p.cota); if (cb) left.appendChild(cb); }
      card.appendChild(left);

      var right = el("div", "prosp-comite-card__right");

      var st = STATUS[p.status] || STATUS.prospeccao;
      var badge = el("span", "prosp-badge");
      badge.textContent = st.label;
      badge.style.background  = st.cor + "18";
      badge.style.color       = st.cor;
      badge.style.borderColor = st.cor + "40";
      right.appendChild(badge);

      right.appendChild(el("h3", "prosp-comite-card__nome", p.nome || "—"));
      if (p.setor) right.appendChild(el("p", "prosp-comite-card__empresa", p.setor));
      if (p.contato || p.cargoContato)
        right.appendChild(el("p", "prosp-comite-card__detail",
          "Contato: " + [p.contato, p.cargoContato].filter(Boolean).join(" · ")));
      if (p.email) right.appendChild(el("p", "prosp-comite-card__detail", "E-mail: " + p.email));
      if (p.telefone) right.appendChild(el("p", "prosp-comite-card__detail", "Tel.: " + p.telefone));
      if (p.valor) right.appendChild(el("p", "prosp-comite-card__detail", "Valor: " + fmtBRL(p.valor)));
      if (p.responsavel) right.appendChild(el("p", "prosp-comite-card__detail", "Responsavel: " + p.responsavel));

      if (Array.isArray(p.beneficios) && p.beneficios.length) {
        var bEl = el("div", "prosp-comite-card__temas");
        bEl.appendChild(el("span", "prosp-comite-card__temas-lbl", "Beneficios:"));
        p.beneficios.forEach(function (b) { bEl.appendChild(el("span", "prosp-chip", b)); });
        right.appendChild(bEl);
      }

      right.appendChild(renderStarsStatic(p.interesse));

      if (p.notas) {
        var notasEl = el("div", "prosp-comite-card__notas");
        notasEl.appendChild(el("strong", "", "Notas: "));
        notasEl.appendChild(document.createTextNode(p.notas));
        right.appendChild(notasEl);
      }

      if (p.site) {
        var linksEl = el("div", "prosp-comite-card__links");
        var sa = el("a", "prosp-link", "Site");
        sa.href = p.site; sa.target = "_blank"; sa.rel = "noopener noreferrer";
        linksEl.appendChild(sa);
        right.appendChild(linksEl);
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
  function render(mount) {
    ensureStyles();
    clear(mount);

    var patr     = getData();
    var lista    = patr.patrocinadores;
    var readonly = !!(window.Gestao && window.Gestao.readonly);
    var filtroAtivo = mount._filtroPatr || "todos";

    function salvarERender(toastMsg) {
      if (window.Gestao) window.Gestao.save();
      render(mount);
      if (toastMsg && window.Gestao) window.Gestao.toast(toastMsg);
    }

    function openNewForm() {
      openModal(null, true, function (novo) {
        lista.push(novo);
        salvarERender("Patrocinador salvo");
      }, null);
    }

    var confirmados = lista.filter(function (p) {
      return p.status === "aprovado" || p.status === "confirmado";
    }).length;
    var valorTotal = lista
      .filter(function (p) { return p.status === "confirmado"; })
      .reduce(function (s, p) { return s + (p.valor || 0); }, 0);

    var statCard = window.Gestao ? window.Gestao.headerStat({
      label: "Patrocinadores",
      value: String(lista.length),
      sub:   confirmados + " confirmado(s)",
      accent: true
    }) : null;

    mount.appendChild(
      window.Gestao ? window.Gestao.pageHeader({
        eyebrow:  "SUMMIT POA PMIRS 2026",
        title:    "Prospecção de Patrocínio",
        subtitle: valorTotal > 0
          ? "Pipeline de patrocinadores · " + fmtBRL(valorTotal) + " confirmados"
          : "Pipeline de patrocinadores",
        right: statCard
      }) : el("h2", "", "Prospecção de Patrocínio")
    );

    var toolbar = el("div", "prosp-toolbar");
    var filterBar = el("div", "prosp-filters");
    var allFilters = [{ key: "todos", label: "Todos (" + lista.length + ")" }].concat(
      STATUS_ORDER.map(function (k) {
        var count = lista.filter(function (p) { return p.status === k; }).length;
        return { key: k, label: STATUS[k].label + " (" + count + ")" };
      })
    );
    allFilters.forEach(function (f) {
      var btn = el("button",
        "prosp-filter-btn" + (filtroAtivo === f.key ? " active" : ""), f.label);
      btn.type = "button";
      btn.addEventListener("click", function () { mount._filtroPatr = f.key; render(mount); });
      filterBar.appendChild(btn);
    });
    toolbar.appendChild(filterBar);

    var toolbarRight = el("div", "prosp-toolbar__right");
    if (lista.length > 0) {
      var btnVista = el("button", "btn sm", "📋 Vista p/ Comite");
      btnVista.type = "button";
      btnVista.addEventListener("click", function () { openVistaView(lista); });
      toolbarRight.appendChild(btnVista);
    }
    if (!readonly) {
      var btnAdd = el("button", "btn btn-primary sm", "+ Patrocinador");
      btnAdd.type = "button";
      btnAdd.addEventListener("click", function () { openNewForm(); });
      toolbarRight.appendChild(btnAdd);
    }
    toolbar.appendChild(toolbarRight);
    mount.appendChild(toolbar);

    var filtrados = filtroAtivo === "todos"
      ? lista
      : lista.filter(function (p) { return p.status === filtroAtivo; });

    if (!filtrados.length) {
      var emptyEl = window.Gestao
        ? window.Gestao.emptyState(
            lista.length ? "Nenhum patrocinador com este status." : "Nenhum patrocinador cadastrado.",
            (!lista.length && !readonly) ? "+ Patrocinador" : null,
            (!lista.length && !readonly) ? openNewForm : null
          )
        : el("p", "prosp-empty__title", "Nenhum patrocinador cadastrado.");
      mount.appendChild(emptyEl);
      return;
    }

    var grid = el("div", "prosp-grid");
    filtrados.forEach(function (p) {
      var onEdit = readonly ? null : function (pat) {
        var idx = findIndex(lista, function (x) { return x.id === pat.id; });
        openModal(pat, false, function (updated) {
          if (idx >= 0) lista[idx] = updated;
          salvarERender("Patrocinador salvo");
        }, function (id) {
          var di = findIndex(lista, function (x) { return x.id === id; });
          if (di >= 0) lista.splice(di, 1);
          salvarERender();
        });
      };
      grid.appendChild(buildCard(p, onEdit));
    });
    mount.appendChild(grid);
  }

  /* ============================================================
     Registro da aba
     ============================================================ */
  function register() { window.Gestao.onTab(TAB_ID, render); }

  if (window.Gestao) { register(); }
  else { document.addEventListener("gestao:ready", register); }
})();
