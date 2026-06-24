/* ============================================================
   documentos.js — Módulo Documentos (aba "Documentos")
   ------------------------------------------------------------
   Materiais e acessos centrais do evento (links/arquivos).
   - Cabeçalho padrão (logo + título + cartão com nº de documentos).
   - Documentos agrupados por categoria.
   - Card por documento: título (link que abre a URL em nova aba,
     rel="noopener"), categoria (badge), descrição e o domínio do
     link em texto secundário.
   - CRUD completo (modal) persistido via Gestao.save().
   - Valida que a URL começa com http(s) — só http/https são aceitos.

   Contrato consumido (window.Gestao):
     Gestao.data.documentos = { documentos:[{id,titulo,url,categoria,descricao}] }
     Gestao.uid(prefix) · Gestao.save() · Gestao.onTab(id, renderFn)
     Gestao.pageHeader(opts) · Gestao.headerStat(opts)

   Segurança: todo valor do usuário vai ao DOM via textContent /
   createElement / .value. Links são <a> com .href/.textContent
   (nunca innerHTML com dados). A URL é validada/sanitizada (só
   http/https) antes de virar href — protege contra javascript:.
   ============================================================ */

(function () {
  "use strict";

  var TAB_ID = "tab-documentos";

  /* ============================================================
     Injeção do CSS do módulo (uma única vez)
     ============================================================ */
  function ensureStyles() {
    if (document.getElementById("doc-css")) return;
    var link = document.createElement("link");
    link.id = "doc-css";
    link.rel = "stylesheet";
    link.href = "css/documentos.css";
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

  /* ============================================================
     URL: validação e domínio
     ------------------------------------------------------------
     Só aceitamos http/https. Usa o construtor URL quando
     disponível (rejeita javascript:, data:, etc.). Sem URL no
     ambiente, cai num teste por prefixo conservador.
     ============================================================ */
  function isUrlValida(url) {
    var s = String(url || "").trim();
    if (!s) return false;
    if (typeof URL === "function") {
      try {
        var u = new URL(s);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch (e) {
        return false;
      }
    }
    return /^https?:\/\/\S+/i.test(s);
  }

  // Extrai o domínio (hostname) de uma URL válida; "" se não der.
  function dominioDe(url) {
    var s = String(url || "").trim();
    if (!s) return "";
    if (typeof URL === "function") {
      try {
        return new URL(s).hostname.replace(/^www\./i, "");
      } catch (e) {
        return "";
      }
    }
    var m = s.match(/^https?:\/\/(?:www\.)?([^/?#]+)/i);
    return m ? m[1] : "";
  }

  /* ============================================================
     Acesso aos dados
     ============================================================ */
  function getDocumentos() {
    var data = (window.Gestao && window.Gestao.data) || {};
    var dd = data.documentos || {};
    if (!Array.isArray(dd.documentos)) dd.documentos = [];
    data.documentos = dd;
    if (window.Gestao) window.Gestao.data = data;
    return dd.documentos;
  }

  /* ============================================================
     Agrupamento por categoria
     ------------------------------------------------------------
     Preserva a ordem de primeira aparição. Categoria vazia vira
     "Sem categoria".
     ============================================================ */
  function agruparPorCategoria(documentos) {
    var ordem = [];
    var mapa = {};
    documentos.forEach(function (d) {
      var cat = (d.categoria && String(d.categoria).trim()) || "Sem categoria";
      if (!mapa[cat]) {
        mapa[cat] = [];
        ordem.push(cat);
      }
      mapa[cat].push(d);
    });
    return ordem.map(function (cat) {
      return { categoria: cat, documentos: mapa[cat] };
    });
  }

  /* ============================================================
     Renderização — card de documento
     ============================================================ */
  function renderCard(d) {
    var card = el("div", "card doc-card");

    var valida = isUrlValida(d.url);
    var tituloTexto = (d.titulo || "").trim() || "Documento sem título";

    // Topo: ícone + título (link quando a URL é válida).
    var top = el("div", "doc-card__top");
    top.appendChild(el("span", "doc-card__icon", valida ? "🔗" : "📄"));

    var tituloHolder = el("div", "doc-card__titulowrap");
    if (valida) {
      var a = el("a", "doc-card__titulo", tituloTexto);
      a.href = String(d.url).trim();
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      tituloHolder.appendChild(a);
    } else {
      tituloHolder.appendChild(el("span", "doc-card__titulo is-semlink", tituloTexto));
    }
    top.appendChild(tituloHolder);
    card.appendChild(top);

    // Categoria (badge).
    if (d.categoria && String(d.categoria).trim()) {
      var meta = el("div", "doc-card__meta");
      meta.appendChild(el("span", "badge blue", String(d.categoria)));
      card.appendChild(meta);
    }

    // Descrição.
    if (d.descricao && String(d.descricao).trim()) {
      card.appendChild(el("div", "doc-card__desc", String(d.descricao)));
    }

    // Domínio do link (texto secundário) ou aviso de URL inválida.
    var dominio = valida ? dominioDe(d.url) : "";
    if (dominio) {
      card.appendChild(el("div", "doc-card__dominio muted-text", dominio));
    } else if (d.url && !valida) {
      card.appendChild(
        el("div", "doc-card__dominio is-invalida", "URL inválida (use http/https)")
      );
    }

    // Anexo (arquivo) — link de download a partir do dataUrl salvo.
    if (d.anexo && d.anexo.dataUrl) {
      var anexoLink = el("a", "doc-card__anexo", "📎 " + (d.anexo.nome || "Baixar anexo"));
      anexoLink.href = d.anexo.dataUrl;
      anexoLink.download = d.anexo.nome || "anexo";
      card.appendChild(anexoLink);
    }

    // Ações: editar / excluir.
    var actions = el("div", "doc-card__actions");
    var edit = el("button", "btn btn-ghost sm", "Editar");
    edit.type = "button";
    edit.addEventListener("click", function () { openForm(d.id); });
    actions.appendChild(edit);

    var del = el("button", "btn btn-ghost sm", "Excluir");
    del.type = "button";
    del.addEventListener("click", function () { removeDocumento(d.id, d.titulo); });
    actions.appendChild(del);

    card.appendChild(actions);
    return card;
  }

  /* ============================================================
     Renderização — grupo (categoria)
     ============================================================ */
  function renderGrupo(grupo) {
    var section = el("section", "doc-grupo");
    section.setAttribute("aria-label", "Categoria: " + grupo.categoria);

    var head = el("div", "doc-grupo__head");
    head.appendChild(el("h3", "doc-grupo__title", grupo.categoria));
    var n = grupo.documentos.length;
    head.appendChild(
      el("span", "doc-grupo__count", n + (n === 1 ? " documento" : " documentos"))
    );
    section.appendChild(head);

    var grid = el("div", "grid cols-3 doc-grid");
    grupo.documentos.forEach(function (d) {
      grid.appendChild(renderCard(d));
    });
    section.appendChild(grid);

    return section;
  }

  /* ============================================================
     CRUD
     ============================================================ */
  function findDocumento(id) {
    var list = getDocumentos();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function upsertDocumento(id, values) {
    var list = getDocumentos();
    if (id) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) {
          list[i] = Object.assign({}, list[i], values, { id: id });
          break;
        }
      }
    } else {
      list.push(Object.assign({ id: window.Gestao.uid("doc") }, values));
    }
    window.Gestao.save();
    render();
  }

  function removeDocumento(id, titulo) {
    var label = titulo && String(titulo).trim() ? '"' + titulo + '"' : "este documento";
    if (!window.confirm("Excluir " + label + "?")) return;
    var data = window.Gestao.data;
    data.documentos.documentos = getDocumentos().filter(function (x) {
      return x.id !== id;
    });
    window.Gestao.save();
    render();
  }

  /* ============================================================
     Formulário (modal)
     ============================================================ */
  var _backdrop = null;

  function closeForm() {
    if (_backdrop && _backdrop.parentNode) {
      _backdrop.parentNode.removeChild(_backdrop);
    }
    _backdrop = null;
    document.removeEventListener("keydown", onEscClose);
  }

  function onEscClose(e) {
    if (e.key === "Escape") closeForm();
  }

  function field(labelText, inputEl, full) {
    var wrap = el("div", "doc-field" + (full ? " full" : ""));
    var id = "doc-f-" + window.Gestao.uid("x");
    var lbl = el("label", null, labelText);
    lbl.setAttribute("for", id);
    inputEl.id = id;
    wrap.appendChild(lbl);
    wrap.appendChild(inputEl);
    return wrap;
  }

  function makeInput(type, value) {
    var inp = document.createElement("input");
    inp.type = type;
    if (value !== undefined && value !== null) inp.value = String(value);
    return inp;
  }

  function openForm(id) {
    var existing = id ? findDocumento(id) : null;

    closeForm();

    _backdrop = el("div", "doc-modal-backdrop");
    _backdrop.addEventListener("click", function (e) {
      void e; /* clicar fora NÃO fecha (evita perda acidental); use Cancelar ou Esc */
    });

    var modal = el("div", "doc-modal");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", existing ? "Editar documento" : "Novo documento");
    modal.appendChild(
      el("h3", "section-title", existing ? "Editar documento" : "Novo documento")
    );

    var form = document.createElement("form");
    form.className = "doc-form";

    var inTitulo = makeInput("text", existing ? existing.titulo : "");
    inTitulo.placeholder = "Título do documento";
    inTitulo.required = true;
    form.appendChild(field("Título", inTitulo, true));

    var inUrl = makeInput("url", existing ? existing.url || "" : "");
    inUrl.placeholder = "https://… (opcional se anexar arquivo)";
    form.appendChild(field("URL (http/https)", inUrl, true));

    // Anexo (arquivo) — guardado como dataUrl no localStorage (máx. 1,5 MB).
    var anexoAtual = existing && existing.anexo ? existing.anexo : null;
    var inArquivo = makeInput("file");
    var arquivoField = field("Anexo (arquivo)", inArquivo, true);
    var anexoInfo = el("div", "doc-anexo-info");
    function pintaAnexo() {
      clear(anexoInfo);
      if (anexoAtual && anexoAtual.nome) {
        anexoInfo.appendChild(el("span", "muted-text", "Anexado: " + anexoAtual.nome + "  "));
        var rm = el("button", "btn btn-ghost sm", "remover");
        rm.type = "button";
        rm.addEventListener("click", function () {
          anexoAtual = null;
          inArquivo.value = "";
          pintaAnexo();
        });
        anexoInfo.appendChild(rm);
      }
    }
    inArquivo.addEventListener("change", function () {
      var f = inArquivo.files && inArquivo.files[0];
      if (!f) return;
      if (f.size > 1.5 * 1024 * 1024) {
        erro.textContent = "Arquivo muito grande (máx. 1,5 MB para anexar no navegador).";
        inArquivo.value = "";
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        anexoAtual = { nome: f.name, dataUrl: String(reader.result) };
        erro.textContent = "";
        pintaAnexo();
      };
      reader.readAsDataURL(f);
    });
    arquivoField.appendChild(anexoInfo);
    form.appendChild(arquivoField);
    pintaAnexo();

    var inCategoria = makeInput("text", existing ? existing.categoria || "" : "");
    inCategoria.placeholder = "Ex.: Divulgação";
    form.appendChild(field("Categoria", inCategoria));

    var taDesc = document.createElement("textarea");
    taDesc.value = existing ? existing.descricao || "" : "";
    taDesc.placeholder = "Breve descrição do material/link";
    form.appendChild(field("Descrição", taDesc, true));

    // Mensagem de validação (aria-live para leitores de tela).
    var erro = el("div", "doc-form-erro");
    erro.setAttribute("aria-live", "polite");
    form.appendChild(erro);

    var actions = el("div", "doc-form-actions");
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
      var titulo = inTitulo.value.trim();
      var url = inUrl.value.trim();

      if (!titulo) {
        erro.textContent = "Informe um título.";
        inTitulo.focus();
        return;
      }
      if (url && !isUrlValida(url)) {
        erro.textContent = "URL inválida. Use um endereço http:// ou https://.";
        inUrl.focus();
        return;
      }
      if (!url && !anexoAtual) {
        erro.textContent = "Informe uma URL ou anexe um arquivo.";
        return;
      }
      erro.textContent = "";

      var values = {
        titulo: titulo,
        url: url,
        categoria: inCategoria.value.trim(),
        descricao: taDesc.value.trim(),
        anexo: anexoAtual
      };
      upsertDocumento(id, values);
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
  function buildHeader(documentos) {
    var Gestao = window.Gestao;
    var n = documentos.length;
    var right = Gestao.headerStat({
      label: "Documentos",
      value: String(n),
      sub: n === 1 ? "registro" : "registros",
      accent: true
    });
    return Gestao.pageHeader({
      eyebrow: "DOCUMENTOS · SUMMIT POA PMIRS 2026",
      title: "Documentos e links",
      subtitle: "Materiais e acessos centrais do evento",
      right: right
    });
  }

  /* ============================================================
     Render principal
     ============================================================ */
  var _mount = null;

  function render() {
    if (!_mount) return;
    var documentos = getDocumentos();
    clear(_mount);

    _mount.appendChild(buildHeader(documentos));

    var root = el("div", "stack");

    var bar = el("div", "spread");
    bar.appendChild(
      el("span", "muted-text", "Centralize links e materiais do evento por categoria.")
    );
    var addBtn = el("button", "btn btn-primary sm", "+ Documento");
    addBtn.type = "button";
    addBtn.addEventListener("click", function () { openForm(null); });
    bar.appendChild(addBtn);
    root.appendChild(bar);

    if (!documentos.length) {
      root.appendChild(
        el("div", "empty", "Nenhum documento cadastrado. Use “+ Documento”.")
      );
    } else {
      var grupos = agruparPorCategoria(documentos);
      grupos.forEach(function (g) {
        root.appendChild(renderGrupo(g));
      });
    }

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

  if (typeof window !== "undefined") {
    if (window.Gestao && typeof window.Gestao.onTab === "function") {
      window.Gestao.onTab(TAB_ID, init);
    } else {
      document.addEventListener("DOMContentLoaded", function () {
        if (window.Gestao && typeof window.Gestao.onTab === "function") {
          window.Gestao.onTab(TAB_ID, init);
        }
      });
    }
  }

  // Exposto para testes headless (funções puras).
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      isUrlValida: isUrlValida,
      dominioDe: dominioDe,
      agruparPorCategoria: agruparPorCategoria
    };
  }
})();
