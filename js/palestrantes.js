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

  /* ---- Contar confirmados num palco ---- */
  function confirmados(palco) {
    return (palco.sessoes || []).filter(function (s) { return s.palestrante && s.palestrante.trim(); }).length;
  }

  /* ---- Conta total de slots e confirmados nos dois palcos ---- */
  function totais(palcos) {
    var total = 0, conf = 0;
    (palcos || []).forEach(function (p) {
      (p.sessoes || []).forEach(function (s) {
        total++;
        if (s.palestrante && s.palestrante.trim()) conf++;
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

    var inpNome    = campoTexto("Palestrante", sess.palestrante, "Nome do palestrante");
    var inpEmpresa = campoTexto("Empresa / Organização", sess.empresa, "Ex.: PMI, CMPC, Gerdau…");

    var wrapTema = el("div", "spk-modal__field");
    wrapTema.appendChild(el("label", null, "Tema / Título da palestra"));
    var txtTema = document.createElement("textarea");
    txtTema.rows = 2;
    txtTema.value = sess.tema || "";
    txtTema.placeholder = "Descreva o tema (opcional)";
    wrapTema.appendChild(txtTema);
    body.appendChild(wrapTema);

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
        empresa:     inpEmpresa.value.trim(),
        tema:        txtTema.value.trim()
      });
      fechar();
    });
  }

  /* ---- Linha de sessão ---- */
  function buildSessao(sess, palcoNome, isMaster, onEdit) {
    var tipo = sess.tipo || "sessao";
    var row = el("div", "spk-sess spk-sess--" + tipo);

    row.appendChild(el("div", "spk-sess__time", sess.horario));

    var body = el("div", "spk-sess__body");

    var tipoBadge = el("span", "spk-tipo spk-tipo--" + tipo);
    tipoBadge.textContent = { keynote: "Keynote", especial: "Especial", sessao: "Sessão" }[tipo] || "Sessão";
    body.appendChild(tipoBadge);

    body.appendChild(el("div", "spk-sess__titulo", sess.titulo));

    var temPalestrante = sess.palestrante && sess.palestrante.trim();
    body.appendChild(el(
      "div",
      "spk-sess__speaker" + (temPalestrante ? "" : " is-empty"),
      temPalestrante ? sess.palestrante : "(a definir)"
    ));

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
  function buildCard(palco, isMaster, onEdit) {
    var conf  = confirmados(palco);
    var total = (palco.sessoes || []).length;

    var card = el("div", "spk-card");

    var head = el("div", "spk-card__head");
    head.appendChild(el("h2", "spk-card__title", palco.nome || "Palco"));
    head.appendChild(el("span", "spk-card__badge", conf + "/" + total + " confirmados"));
    card.appendChild(head);

    (palco.sessoes || []).forEach(function (sess) {
      card.appendChild(buildSessao(sess, palco.nome, isMaster, onEdit));
    });

    return card;
  }

  /* ---- Render principal ---- */
  function render(mount, data) {
    ensureStyles();
    mount.innerHTML = "";
    data = data || {};

    var plData = data.palestrantes || {};
    var palcos = plData.palcos || [];
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

    var isMaster = window.Gestao && window.Gestao.role && window.Gestao.role() === "master";

    function onEdit(sessId, vals) {
      palcos.forEach(function (palco) {
        (palco.sessoes || []).forEach(function (s) {
          if (s.id === sessId) {
            s.palestrante = vals.palestrante;
            s.empresa = vals.empresa;
            s.tema = vals.tema;
          }
        });
      });
      data.palestrantes = plData;
      window.Gestao.save();
      render(mount, data);
    }

    var grid = el("div", "spk-grid");
    palcos.forEach(function (palco) {
      grid.appendChild(buildCard(palco, isMaster, onEdit));
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
