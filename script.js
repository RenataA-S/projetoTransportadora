import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, collection, addDoc, getDocs, doc, getDoc, updateDoc, query, where, serverTimestamp, onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// 1. CONFIGURAÇÃO DO FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyBXGqn85J6RDkpNCr-_z31MM4LPhROg6zI",
  authDomain: "projetotransportadora-828a3.firebaseapp.com",
  projectId: "projetotransportadora-828a3",
  storageBucket: "projetotransportadora-828a3.firebasestorage.app",
  messagingSenderId: "845742289661",
  appId: "1:845742289661:web:8a834f453215330560c494"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);

const COLECAO_ATENDIMENTOS = "atendimentos";
const COLECAO_RELATORIOS = "relatorios_salvos";

// Registrar Plugin de Porcentagens e Rótulos no Chart.js
if (typeof ChartDataLabels !== 'undefined') {
  Chart.register(ChartDataLabels);
}

// Variáveis Globais de Estado
let atendimentoAtualId = null;
let html5QrScanner = null;
let usuarioLogado = null;
let unsubscribeFila = null;
let historicoCompleto = [];
let historicoExibido = [];

// Instâncias dos Gráficos Chart.js
let graficoEvolucao = null;
let graficoPizza = null;
let graficoRosca = null;
let graficoGauge = null;

const OPERACAO_CORES = {
  'CARREGAMENTO': '#0a3d62',
  'DESCARGA': '#e67e22',
  'COLETA': '#27ae60',
  'ENTREGA': '#2980b9',
  'TRANSFERENCIA': '#8e44ad',
  'DEVOLUCAO': '#c0392b',
  'OUTRO': '#7f8c8d'
};

// 2. MÁSCARAS E UTILITÁRIOS
function aplicarCapitalizacao(texto) {
  if (!texto) return '';
  return texto.toLowerCase().split(' ').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

function aplicarMascaraCPF(valor) {
  if (!valor) return '';
  return valor.replace(/\D/g, '').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2').substring(0, 14);
}

window.formatarNumeroWhatsApp = function(telefone) {
  if (!telefone) return "";
  let num = telefone.replace(/\D/g, "");
  if (num.length === 10 || num.length === 11) num = "55" + num;
  return num;
};

window.abrirWhatsApp = function(telefone, mensagem) {
  const numLimpo = window.formatarNumeroWhatsApp(telefone);
  if (!numLimpo) {
    alert("Número de telefone/WhatsApp inválido.");
    return;
  }
  const url = `https://api.whatsapp.com/send?phone=${numLimpo}&text=${encodeURIComponent(mensagem)}`;
  window.open(url, '_blank');
};

document.addEventListener('input', (e) => {
  if (e.target.classList.contains('input-capitalizar')) {
    const pos = e.target.selectionStart;
    e.target.value = aplicarCapitalizacao(e.target.value);
    e.target.setSelectionRange(pos, pos);
  }
  if (e.target.classList.contains('input-cpf')) {
    e.target.value = aplicarMascaraCPF(e.target.value);
  }
});

function formatDateTime(timestamp) {
  if (!timestamp) return "--/--/---- --:--";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatTimeOnly(timestamp) {
  if (!timestamp) return "--:--";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function gerarAtendimentoId() {
  const d = new Date();
  const dataFormatada = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const aleatorio = String(Math.floor(Math.random() * 90000) + 10000);
  return `ATD-${dataFormatada}-${aleatorio}`;
}

function extrairCodigoQRCode(qrText) {
  if (!qrText) return "";
  if (qrText.includes("id=")) {
    const params = new URLSearchParams(qrText.includes("?") ? qrText.split("?")[1] : qrText);
    return params.get("id") || qrText.split("id=")[1].split("&")[0].trim();
  }
  return qrText.trim();
}

// 3. NAVEGAÇÃO SPA
window.navegarPara = function(idAba) {
  document.querySelectorAll('.aba-conteudo').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));

  const abaAlvo = document.getElementById(idAba);
  if (abaAlvo) abaAlvo.classList.remove('hidden');

  const linkAtivo = Array.from(document.querySelectorAll('.nav-link')).find(a => a.getAttribute('onclick')?.includes(idAba));
  if (linkAtivo) linkAtivo.classList.add('active');

  window.pararCamera();

  if (idAba === 'aba-docas') {
    iniciarEscutaFilaETempoReal();
  } else if (idAba === 'aba-admin') {
    window.carregarHistoricoAtendimentos();
    window.carregarRelatoriosSalvosFirebase();
  }
};

// 4. AUTENTICAÇÃO
onAuthStateChanged(auth, (user) => {
  usuarioLogado = user;
  const navMenu = document.getElementById('nav-menu');
  if (!user) {
    if (navMenu) navMenu.style.display = 'none';
    window.navegarPara('aba-login');
  } else {
    if (navMenu) navMenu.style.display = 'flex';
    if (!document.getElementById('aba-login')?.classList.contains('hidden')) {
      window.navegarPara('aba-entrada');
    }
  }
});

window.fazerLogin = function(email, senha) {
  signInWithEmailAndPassword(auth, email, senha)
    .then(() => window.navegarPara('aba-entrada'))
    .catch((erro) => alert("Falha na autenticação: " + erro.message));
};

document.getElementById('btn-logout')?.addEventListener('click', () => {
  signOut(auth).then(() => window.navegarPara('aba-login'));
});

// 5. ENTRADA DE VEÍCULOS & TICKET
window.salvarEntrada = async function() {
  const docIdEdicao = document.getElementById('edit-doc-id')?.value;
  const placa = document.getElementById('placa-veiculo')?.value.toUpperCase().trim();
  const tipoVeiculo = document.getElementById('tipo-veiculo')?.value;
  const motorista = document.getElementById('nome-motorista')?.value.trim();
  const documentoMotorista = document.getElementById('cpf-motorista')?.value.trim();
  const ajudante = document.getElementById('nome-ajudante')?.value.trim();
  const documentoAjudante = document.getElementById('cpf-ajudante')?.value.trim();
  const telefone = document.getElementById('telefone-motorista')?.value.trim();
  const tipoOperacao = document.getElementById('tipo-operacao')?.value;
  const numeroOp = document.getElementById('numero-op')?.value.trim() || "N/A";
  const numeroCarga = document.getElementById('numero-carga')?.value.trim();
  const transportadora = document.getElementById('transportadora')?.value.trim();
  const cliente = document.getElementById('cliente')?.value.trim();
  const observacao = document.getElementById('observacao')?.value.trim();

  if (!placa || !tipoVeiculo || !motorista || !documentoMotorista || !telefone || !numeroCarga || !transportadora || !cliente) {
    alert("Preencha todos os campos obrigatórios marcados com *.");
    return;
  }

  try {
    let idPersonalizado = "";
    const agora = new Date();
    
    if (docIdEdicao) {
      const docRef = doc(db, COLECAO_ATENDIMENTOS, docIdEdicao);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) throw new Error("Registro não localizado.");

      idPersonalizado = docSnap.data().atendimentoId;

      await updateDoc(docRef, {
        placa, tipoVeiculo, motorista, documentoMotorista,
        ajudante: ajudante || "", documentoAjudante: documentoAjudante || "",
        telefone, transportadora, tipoOperacao,
        numeroOp, numeroCarga, cliente,
        observacao: observacao || "",
        atualizadoEm: serverTimestamp()
      });

      alert("Cadastro revisado e atualizado com sucesso!");
    } else {
      idPersonalizado = gerarAtendimentoId();

      const dadosAtendimento = {
        atendimentoId: idPersonalizado,
        placa, tipoVeiculo, motorista, documentoMotorista, 
        ajudante: ajudante || "", documentoAjudante: documentoAjudante || "",
        telefone, transportadora, tipoOperacao, 
        numeroOp, numeroCarga, cliente,
        observacao: observacao || "",
        dataCadastro: agora.toISOString().slice(0, 10),
        horarioCadastro: formatTimeOnly(agora),
        horarioCheckin: null, horarioChamada: null, horarioChegadaDoca: null,
        horarioInicioOperacao: null, horarioFinalizacao: null, horarioSaida: null,
        doca: null, status: "CADASTRADO", pesoToneladas: null, usuarioChamada: null,
        criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp()
      };

      await addDoc(collection(db, COLECAO_ATENDIMENTOS), dadosAtendimento);
    }

    document.getElementById('ticket-id').innerText = idPersonalizado;
    document.getElementById('ticket-op').innerText = numeroOp;
    document.getElementById('ticket-placa').innerText = placa;
    document.getElementById('ticket-motorista').innerText = motorista;
    document.getElementById('ticket-telefone').innerText = telefone;
    document.getElementById('ticket-ajudante').innerText = ajudante ? `${ajudante} (${documentoAjudante})` : 'Nenhum';
    document.getElementById('ticket-operacao').innerText = tipoOperacao;
    document.getElementById('ticket-carga').innerText = numeroCarga;
    document.getElementById('ticket-data').innerText = `${agora.toLocaleDateString('pt-BR')} ${formatTimeOnly(agora)}`;

    const qrPayload = `https://projetotransportadora-828a3.web.app/?id=${idPersonalizado}&op=${encodeURIComponent(numeroOp)}&placa=${encodeURIComponent(placa)}`;
    const qrContainer = document.getElementById('qrcode-container');
    if (qrContainer) {
      qrContainer.innerHTML = "";
      if (typeof QRCode !== "undefined") new QRCode(qrContainer, { text: qrPayload, width: 160, height: 160 });
    }

    document.getElementById('area-ticket')?.classList.remove('hidden');
    window.cancelarEdicaoCadastro();
  } catch (erro) {
    console.error(erro);
    alert("Erro ao salvar cadastro: " + erro.message);
  }
};

window.enviarWhatsAppTicket = function() {
  const id = document.getElementById('ticket-id')?.innerText;
  const motorista = document.getElementById('ticket-motorista')?.innerText;
  const placa = document.getElementById('ticket-placa')?.innerText;
  const telefone = document.getElementById('ticket-telefone')?.innerText;
  const operacao = document.getElementById('ticket-operacao')?.innerText;

  if (!telefone || telefone === '--') return alert("Telefone não encontrado.");

  const msg = `Olá *${motorista}*!\n\nSeu cadastro de entrada na *Transportadora* foi realizado com sucesso.\n\n📌 *ID:* ${id}\n🚚 *Placa:* ${placa}\n📋 *Operação:* ${operacao}\n\nAcompanhe seu status pelo link:\nhttps://projetotransportadora-828a3.web.app/`;
  window.abrirWhatsApp(telefone, msg);
};

window.buscarCadastroParaEdicao = async function() {
  const termo = document.getElementById('input-busca-edicao')?.value.trim();
  if (!termo) return alert("Informe a Placa ou o ID do Atendimento.");

  try {
    let q = query(collection(db, COLECAO_ATENDIMENTOS), where("atendimentoId", "==", termo));
    let snap = await getDocs(q);

    if (snap.empty) {
      q = query(collection(db, COLECAO_ATENDIMENTOS), where("placa", "==", termo.toUpperCase()));
      snap = await getDocs(q);
    }

    if (snap.empty) return alert("Nenhum cadastro encontrado.");

    const docSnap = snap.docs[snap.docs.length - 1];
    carregarDadosFormularioEdicao(docSnap.id, docSnap.data());
  } catch (err) {
    alert("Erro ao buscar cadastro para revisão.");
  }
};

window.revisarTicketAtual = function() {
  const ticketId = document.getElementById('ticket-id')?.innerText;
  if (ticketId && ticketId !== '--') {
    document.getElementById('input-busca-edicao').value = ticketId;
    window.buscarCadastroParaEdicao();
  }
};

function carregarDadosFormularioEdicao(docId, data) {
  document.getElementById('edit-doc-id').value = docId;
  document.getElementById('placa-veiculo').value = data.placa || '';
  document.getElementById('tipo-veiculo').value = data.tipoVeiculo || '';
  document.getElementById('nome-motorista').value = data.motorista || '';
  document.getElementById('cpf-motorista').value = data.documentoMotorista || '';
  document.getElementById('nome-ajudante').value = data.ajudante || '';
  document.getElementById('cpf-ajudante').value = data.documentoAjudante || '';
  document.getElementById('telefone-motorista').value = data.telefone || '';
  document.getElementById('tipo-operacao').value = data.tipoOperacao || 'CARREGAMENTO';
  document.getElementById('numero-op').value = data.numeroOp === 'N/A' ? '' : (data.numeroOp || '');
  document.getElementById('numero-carga').value = data.numeroCarga || '';
  document.getElementById('transportadora').value = data.transportadora || '';
  document.getElementById('cliente').value = data.cliente || '';
  document.getElementById('observacao').value = data.observacao || '';

  document.getElementById('titulo-form-entrada').innerText = `Revisando Cadastro [${data.atendimentoId}]`;
  document.getElementById('subtitulo-form-entrada').innerText = "Altere os dados necessários e clique em Salvar Alterações.";
  document.getElementById('btn-submit-entrada').innerText = "💾 Salvar Alterações do Cadastro";
  document.getElementById('btn-cancelar-edicao').classList.remove('hidden');

  window.scrollTo({ top: document.getElementById('form-entrada').offsetTop - 80, behavior: 'smooth' });
}

window.cancelarEdicaoCadastro = function() {
  document.getElementById('edit-doc-id').value = '';
  document.getElementById('form-entrada')?.reset();
  document.getElementById('titulo-form-entrada').innerText = "Registro de Entrada de Veículo";
  document.getElementById('subtitulo-form-entrada').innerText = "Cadastre os dados da carga e do motorista para liberação ao pátio";
  document.getElementById('btn-submit-entrada').innerText = "Registrar Entrada e Gerar Ticket";
  document.getElementById('btn-cancelar-edicao').classList.add('hidden');
};

// IMPRESSÃO DE TICKET COM QR CODE CENTRALIZADO EM PDF
window.imprimirTicketEntrada = function() {
  const ticketElement = document.getElementById('area-ticket');
  if (!ticketElement) return;

  const htmlConteudo = ticketElement.innerHTML;
  const win = window.open('', '_blank', 'width=450,height=700');
  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Ticket - Transportadora</title>
      <style>
        @page { size: auto; margin: 0; }
        body {
          font-family: Arial, sans-serif;
          background: #ffffff;
          margin: 0;
          padding: 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }
        .ticket-wrapper {
          width: 100%;
          max-width: 380px;
          border: 2px dashed #0a3d62;
          padding: 20px;
          border-radius: 10px;
          text-align: center;
          box-sizing: border-box;
          margin: 0 auto;
        }
        .qr-code-frame {
          display: flex !important;
          justify-content: center !important;
          align-items: center !important;
          margin: 15px auto !important;
          text-align: center !important;
        }
        .qr-code-frame img, .qr-code-frame canvas {
          margin: 0 auto !important;
          display: block !important;
        }
        .ticket-info {
          text-align: left;
          background: #f8fafc;
          padding: 10px;
          border-radius: 6px;
          margin-top: 10px;
          font-size: 0.85rem;
        }
        .info-row {
          display: flex;
          justify-content: space-between;
          padding: 4px 0;
          border-bottom: 1px dashed #cbd5e1;
        }
        .ticket-actions { display: none !important; }
      </style>
    </head>
    <body>
      ${htmlConteudo}
      <script>
        window.onload = function() {
          window.print();
          window.close();
        };
      <\/script>
    </body>
    </html>
  `);
  win.document.close();
};

// 6. CÂMERA & PROCESSAMENTO QR
window.iniciarCamera = async function(elementId, callbackSucesso) {
  await window.pararCamera();
  const element = document.getElementById(elementId);
  if (element) element.classList.remove("hidden");

  try {
    html5QrScanner = new Html5Qrcode(elementId);
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    await html5QrScanner.start(
      { facingMode: { ideal: "environment" } },
      config,
      callbackSucesso,
      () => {}
    );
  } catch (err) { 
    alert("Erro ao acessar a câmera: " + err.message); 
  }
};

window.pararCamera = async function() {
  if (html5QrScanner) {
    try { if (html5QrScanner.isScanning) await html5QrScanner.stop(); } catch (e) {}
    try { html5QrScanner.clear(); } catch (e) {}
    html5QrScanner = null;
  }
};

window.habilitarScannerCheckin = function() {
  window.iniciarCamera("reader-checkin", async (qrMessage) => {
    await window.pararCamera();
    processarCheckinQRCode(qrMessage);
  });
};

window.buscarCheckinPorTermo = async function() {
  const termo = document.getElementById('input-busca-checkin')?.value.trim();
  if (!termo) return alert("Digite o ID ou a Placa.");
  await processarCheckinQRCode(termo);
};

async function processarCheckinQRCode(qrValue) {
  const alertBox = document.getElementById("checkin-alert");

  try {
    const atendimentoId = extrairCodigoQRCode(qrValue);
    let q = query(collection(db, COLECAO_ATENDIMENTOS), where("atendimentoId", "==", atendimentoId));
    let snap = await getDocs(q);

    if (snap.empty) {
      q = query(collection(db, COLECAO_ATENDIMENTOS), where("placa", "==", atendimentoId.toUpperCase()));
      snap = await getDocs(q);
    }

    if (snap.empty) throw new Error(`Atendimento/Placa (${atendimentoId}) não encontrado.`);

    const docSnap = snap.docs[snap.docs.length - 1];
    const data = docSnap.data();

    let novoStatus = data.status;
    if (data.status === "CADASTRADO" || data.status === "AGUARDANDO_CHAMADA") {
      novoStatus = "AGUARDANDO_CHAMADA";
      await updateDoc(doc(db, COLECAO_ATENDIMENTOS, docSnap.id), {
        status: novoStatus,
        horarioCheckin: serverTimestamp(),
        atualizadoEm: serverTimestamp()
      });
    }

    document.getElementById('checkin-resumo-id').innerText = data.atendimentoId;
    document.getElementById('checkin-resumo-placa').innerText = data.placa;
    document.getElementById('checkin-resumo-motorista').innerText = data.motorista;
    document.getElementById('checkin-resumo-status').innerText = novoStatus;

    document.getElementById('card-confirmacao-checkin')?.classList.remove('hidden');
    if (alertBox) alertBox.classList.add('hidden');
  } catch (err) {
    if (alertBox) {
      alertBox.textContent = err.message;
      alertBox.className = "alert alert-danger";
      alertBox.classList.remove("hidden");
    }
  }
}

window.habilitarScannerDoca = function() {
  window.iniciarCamera("reader-doca", async (qrMessage) => {
    await window.pararCamera();
    const atendimentoId = extrairCodigoQRCode(qrMessage);

    let q = query(collection(db, COLECAO_ATENDIMENTOS), where("atendimentoId", "==", atendimentoId));
    let snap = await getDocs(q);

    if (snap.empty) {
      q = query(collection(db, COLECAO_ATENDIMENTOS), where("placa", "==", atendimentoId.toUpperCase()));
      snap = await getDocs(q);
    }

    if (snap.empty) return alert(`Atendimento (${atendimentoId}) não encontrado.`);

    const docSnap = snap.docs[0];
    const data = docSnap.data();

    if (data.status === "CHAMADO" || data.status === "A_CAMINHO_DA_DOCA") {
      await updateDoc(doc(db, COLECAO_ATENDIMENTOS, docSnap.id), {
        status: "NA_DOCA",
        horarioChegadaDoca: serverTimestamp(),
        atualizadoEm: serverTimestamp()
      });
      alert(`Veículo ${data.placa} chegou na ${data.doca}! Status: NA_DOCA.`);
    } else if (data.status === "NA_DOCA") {
      window.iniciarOperacaoDoca(docSnap.id);
      alert(`Operação iniciada para a placa ${data.placa}.`);
    } else if (data.status === "EM_OPERACAO") {
      window.finalizarOperacaoDoca(docSnap.id);
      alert(`Operação finalizada para ${data.placa}. Encaminhado à Balança.`);
    } else {
      alert(`Status atual: "${data.status}". Nenhum processo pendente.`);
    }
  });
};

// 7. DOCAS & FILA EM TEMPO REAL
function iniciarEscutaFilaETempoReal() {
  if (unsubscribeFila) unsubscribeFila();

  const q = query(collection(db, COLECAO_ATENDIMENTOS));
  unsubscribeFila = onSnapshot(q, (snapshot) => {
    const todosAtendimentos = [];
    snapshot.forEach(docSnap => todosAtendimentos.push({ idFirestore: docSnap.id, ...docSnap.data() }));

    renderizarGridDocas(todosAtendimentos);
    renderizarFilaEspera(todosAtendimentos);
  });
}

function renderizarGridDocas(lista) {
  const gridContainer = document.getElementById('container-docas-grid');
  if (!gridContainer) return;

  gridContainer.innerHTML = "";

  const docas = [];
  for (let i = 1; i <= 20; i++) {
    docas.push(`Doca ${String(i).padStart(2, '0')}`);
  }

  docas.forEach((nomeDoca) => {
    const ocupante = lista.find(item => item.doca === nomeDoca && ["CHAMADO", "A_CAMINHO_DA_DOCA", "NA_DOCA", "EM_OPERACAO"].includes(item.status));

    const card = document.createElement('div');
    card.className = `doca-card ${ocupante ? 'ocupada' : 'livre'}`;

    if (!ocupante) {
      card.innerHTML = `
        <div class="doca-header"><strong>${nomeDoca}</strong><span class="doca-status-badge badge-livre">LIVRE</span></div>
        <p class="doca-info-vazio">Nenhum veículo alocado</p>
      `;
    } else {
      card.innerHTML = `
        <div class="doca-header"><strong>${nomeDoca}</strong><span class="doca-status-badge badge-ocupada">${ocupante.status}</span></div>
        <div class="doca-detalhes">
          <div><strong>Placa:</strong> ${ocupante.placa}</div>
          <div><strong>Motorista:</strong> ${ocupante.motorista}</div>
          <div><strong>Operação:</strong> ${ocupante.tipoOperacao}</div>
        </div>
        <div class="doca-acoes">
          ${ocupante.status === 'NA_DOCA' ? `<button class="btn btn-primary btn-sm" onclick="window.iniciarOperacaoDoca('${ocupante.idFirestore}')">Iniciar Operação</button>` : ''}
          ${ocupante.status === 'EM_OPERACAO' ? `<button class="btn btn-success btn-sm" onclick="window.finalizarOperacaoDoca('${ocupante.idFirestore}')">Finalizar Doca</button>` : ''}
        </div>
      `;
    }
    gridContainer.appendChild(card);
  });
}

function renderizarFilaEspera(lista) {
  const tbody = document.getElementById('tbody-fila-espera');
  if (!tbody) return;

  tbody.innerHTML = "";
  const fila = lista.filter(item => item.status === "AGUARDANDO_CHAMADA");

  if (fila.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center">Nenhum veículo aguardando no pátio.</td></tr>`;
    return;
  }

  fila.forEach((item, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>#${index + 1}</strong></td>
      <td>${formatDateTime(item.horarioCheckin)}</td>
      <td>${item.atendimentoId}</td>
      <td><strong>${item.placa}</strong></td>
      <td>${item.motorista}</td>
      <td>${item.tipoOperacao}</td>
      <td>${item.transportadora}</td>
      <td>
        ${item.telefone ? `<button class="btn btn-whatsapp btn-sm" onclick="window.abrirWhatsApp('${item.telefone}', 'Olá ${item.motorista}, seu veículo com placa ${item.placa} foi chamado. Por favor, apresente-se no pátio.')">💬 WhatsApp</button>` : '-'}
      </td>
      <td>
        <button class="btn btn-sm btn-chamar-veiculo" onclick="window.abrirModalChamar('${item.idFirestore}', '${item.placa}')">
          📣 CHAMAR VEÍCULO
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.abrirModalChamar = function(idFirestore, placa) {
  atendimentoAtualId = idFirestore;
  document.getElementById('modal-placa').innerText = placa;
  document.getElementById('modal-chamar-doca').classList.remove('hidden');
};

window.fecharModalChamar = function() {
  atendimentoAtualId = null;
  document.getElementById('modal-chamar-doca').classList.add('hidden');
};

window.confirmarChamadaDoca = async function() {
  if (!atendimentoAtualId) return;
  const docaSelecionada = document.getElementById('select-doca-chamar').value;

  try {
    const docRef = doc(db, COLECAO_ATENDIMENTOS, atendimentoAtualId);
    const docSnap = await getDoc(docRef);
    const dados = docSnap.exists() ? docSnap.data() : null;

    await updateDoc(docRef, {
      doca: docaSelecionada,
      status: "CHAMADO",
      usuarioChamada: usuarioLogado?.email || "Líder de Pátio",
      horarioChamada: serverTimestamp(),
      atualizadoEm: serverTimestamp()
    });

    alert(`Veículo chamado para a ${docaSelecionada}!`);
    window.fecharModalChamar();

    if (dados && dados.telefone) {
      if (confirm(`Deseja notificar o motorista ${dados.motorista} no WhatsApp?`)) {
        const msg = `Olá *${dados.motorista}*!\n\nSeu veículo de placa *${dados.placa}* foi chamado para dirigir-se à *${docaSelecionada}*.\n\nPor favor, dirija-se à doca indicada imediatamente.`;
        window.abrirWhatsApp(dados.telefone, msg);
      }
    }
  } catch (err) {
    alert("Erro ao realizar chamada para doca.");
  }
};

window.iniciarOperacaoDoca = async function(idFirestore) {
  try {
    await updateDoc(doc(db, COLECAO_ATENDIMENTOS, idFirestore), {
      status: "EM_OPERACAO",
      horarioInicioOperacao: serverTimestamp(),
      atualizadoEm: serverTimestamp()
    });
  } catch (err) { alert("Erro ao iniciar operação."); }
};

window.finalizarOperacaoDoca = async function(idFirestore) {
  try {
    await updateDoc(doc(db, COLECAO_ATENDIMENTOS, idFirestore), {
      status: "FINALIZADO",
      horarioFinalizacao: serverTimestamp(),
      atualizadoEm: serverTimestamp()
    });
  } catch (err) { alert("Erro ao finalizar doca."); }
};

// 8. BALANÇA & SAÍDA
window.buscarAtendimentoBalanca = async function() {
  const termo = document.getElementById('input-buscar-balanca')?.value.trim();
  if (!termo) return alert("Digite o ID ou Placa.");

  try {
    let q = query(collection(db, COLECAO_ATENDIMENTOS), where("atendimentoId", "==", termo));
    let snap = await getDocs(q);

    if (snap.empty) {
      q = query(collection(db, COLECAO_ATENDIMENTOS), where("placa", "==", termo.toUpperCase()));
      snap = await getDocs(q);
    }

    if (snap.empty) return alert("Nenhum atendimento localizado.");

    const docSnap = snap.docs[0];
    const data = docSnap.data();

    atendimentoAtualId = docSnap.id;

    document.getElementById('bal-id').innerText = data.atendimentoId;
    document.getElementById('bal-placa').innerText = data.placa;
    document.getElementById('bal-motorista').innerText = data.motorista;
    document.getElementById('bal-telefone').innerText = data.telefone || '--';
    document.getElementById('bal-ajudante').innerText = data.ajudante ? `${data.ajudante} (${data.documentoAjudante})` : 'Nenhum';
    document.getElementById('bal-operacao').innerText = data.tipoOperacao;
    document.getElementById('bal-doca').innerText = data.doca || 'N/A';
    document.getElementById('bal-status').innerText = data.status;
    
    if (document.getElementById('peso-tonelada')) {
      document.getElementById('peso-tonelada').value = data.pesoToneladas || '';
    }

    document.getElementById('secao-liberacao-saida')?.classList.remove('hidden');
  } catch (err) { alert("Erro na busca."); }
};

window.confirmarSaidaBalança = async function() {
  if (!atendimentoAtualId) return;

  const peso = document.getElementById('peso-tonelada')?.value;
  if (!peso || peso <= 0) {
    alert("Informe o peso registrado na balança em toneladas.");
    return;
  }

  try {
    await updateDoc(doc(db, COLECAO_ATENDIMENTOS, atendimentoAtualId), {
      status: "SAIDA_LIBERADA",
      pesoToneladas: parseFloat(peso),
      horarioSaida: serverTimestamp(),
      atualizadoEm: serverTimestamp()
    });

    alert("Peso registrado e saída liberada com sucesso!");
    document.getElementById('secao-liberacao-saida')?.classList.add('hidden');
    document.getElementById('form-buscar-balanca')?.reset();
    atendimentoAtualId = null;
  } catch (err) { alert("Erro ao gravar saída."); }
};

// 9. CONSULTA DE STATUS
window.consultarStatusPublico = async function() {
  const termo = document.getElementById('input-consulta-termo')?.value.trim();
  if (!termo) return alert("Informe o ID ou a Placa.");

  try {
    let q = query(collection(db, COLECAO_ATENDIMENTOS), where("atendimentoId", "==", termo));
    let snap = await getDocs(q);

    if (snap.empty) {
      q = query(collection(db, COLECAO_ATENDIMENTOS), where("placa", "==", termo.toUpperCase()));
      snap = await getDocs(q);
    }

    if (snap.empty) return alert("Nenhum registro encontrado.");

    const data = snap.docs[0].data();

    document.getElementById('cons-id').innerText = data.atendimentoId;
    document.getElementById('cons-placa').innerText = data.placa;
    document.getElementById('cons-motorista').innerText = data.motorista;
    document.getElementById('cons-telefone').innerText = data.telefone || '--';
    document.getElementById('cons-ajudante').innerText = data.ajudante ? `${data.ajudante} (${data.documentoAjudante})` : 'Nenhum';
    document.getElementById('cons-operacao').innerText = data.tipoOperacao;
    document.getElementById('cons-doca').innerText = data.doca || 'Pátio / Não Alocado';
    document.getElementById('cons-peso').innerText = data.pesoToneladas ? `${data.pesoToneladas} t` : 'Não Pesado';
    document.getElementById('cons-status').innerText = data.status;
    document.getElementById('cons-data').innerText = formatDateTime(data.atualizadoEm || data.criadoEm);

    document.getElementById('secao-resultado-consulta')?.classList.remove('hidden');
  } catch (err) { alert("Erro ao consultar status."); }
};

// 10. PAINEL ADMIN, DASHBOARD & MULTIPLOS GRÁFICOS
window.alternarModoRelatorioAdm = function(modo) {
  const containerDashboard = document.getElementById('container-admin-dashboard');
  const containerExcel = document.getElementById('container-admin-excel');
  const containerTabela = document.getElementById('container-admin-tabela');

  if (modo === 'dashboard') {
    containerDashboard?.classList.remove('hidden');
    containerTabela?.classList.remove('hidden');
    containerExcel?.classList.add('hidden');
  } else if (modo === 'simples') {
    containerDashboard?.classList.add('hidden');
    containerExcel?.classList.add('hidden');
    containerTabela?.classList.remove('hidden');
  } else if (modo === 'excel') {
    containerDashboard?.classList.add('hidden');
    containerTabela?.classList.add('hidden');
    containerExcel?.classList.remove('hidden');
  }
};

window.carregarHistoricoAtendimentos = async function() {
  try {
    const snap = await getDocs(collection(db, COLECAO_ATENDIMENTOS));
    historicoCompleto = [];
    snap.forEach(d => historicoCompleto.push({ idFirestore: d.id, ...d.data() }));

    historicoExibido = [...historicoCompleto];
    renderizarDashboardEAdmin(historicoExibido);
  } catch (err) { console.error(err); }
};

window.alternarCamposFiltroData = function() {
  const tipo = document.getElementById('select-tipo-filtro-data')?.value;
  document.getElementById('box-filtro-dia')?.classList.add('hidden');
  document.getElementById('box-filtro-mes')?.classList.add('hidden');
  document.getElementById('box-filtro-ano')?.classList.add('hidden');

  if (tipo === 'dia') document.getElementById('box-filtro-dia')?.classList.remove('hidden');
  if (tipo === 'mes') document.getElementById('box-filtro-mes')?.classList.remove('hidden');
  if (tipo === 'ano') document.getElementById('box-filtro-ano')?.classList.remove('hidden');
};

window.aplicarFiltrosAdmin = function() {
  const tipoFiltro = document.getElementById('select-tipo-filtro-data')?.value;
  const termoTexto = document.getElementById('input-busca-admin')?.value.toLowerCase().trim();

  let lista = [...historicoCompleto];

  if (tipoFiltro === 'dia') {
    const diaVal = document.getElementById('filtro-data-dia')?.value;
    if (diaVal) lista = lista.filter(item => item.dataCadastro === diaVal);
  } else if (tipoFiltro === 'mes') {
    const mesVal = document.getElementById('filtro-data-mes')?.value;
    if (mesVal) lista = lista.filter(item => item.dataCadastro && item.dataCadastro.startsWith(mesVal));
  } else if (tipoFiltro === 'ano') {
    const anoVal = document.getElementById('filtro-data-ano')?.value;
    if (anoVal) lista = lista.filter(item => item.dataCadastro && item.dataCadastro.startsWith(anoVal));
  }

  if (termoTexto) {
    lista = lista.filter(item => {
      return (
        (item.atendimentoId && item.atendimentoId.toLowerCase().includes(termoTexto)) ||
        (item.placa && item.placa.toLowerCase().includes(termoTexto)) ||
        (item.motorista && item.motorista.toLowerCase().includes(termoTexto)) ||
        (item.tipoOperacao && item.tipoOperacao.toLowerCase().includes(termoTexto)) ||
        (item.status && item.status.toLowerCase().includes(termoTexto)) ||
        (item.doca && item.doca.toLowerCase().includes(termoTexto)) ||
        (item.numeroOp && item.numeroOp.toLowerCase().includes(termoTexto))
      );
    });
  }

  historicoExibido = lista;
  renderizarDashboardEAdmin(historicoExibido);
};

document.getElementById('tipo-grafico-select')?.addEventListener('change', () => {
  renderizarDashboardEAdmin(historicoExibido);
});

function renderizarDashboardEAdmin(lista) {
  let espera = 0, chamados = 0, doca = 0, finalizados = 0, cadastradoSemCheckin = 0, saidaLiberada = 0;
  let pesoTotal = 0;
  let contagemOperacoes = {};
  let contagemStatus = {};
  let contagemDatas = {};
  let carregamentoEntregaCount = 0;

  const tbody = document.getElementById('tbody-historico');
  if (tbody) tbody.innerHTML = "";

  lista.forEach(item => {
    if (item.status === "CADASTRADO") cadastradoSemCheckin++;
    if (item.status === "AGUARDANDO_CHAMADA") espera++;
    if (["CHAMADO", "A_CAMINHO_DA_DOCA"].includes(item.status)) chamados++;
    if (["NA_DOCA", "EM_OPERACAO"].includes(item.status)) doca++;
    if (item.status === "FINALIZADO") finalizados++;
    if (item.status === "SAIDA_LIBERADA") saidaLiberada++;

    if (item.pesoToneladas) pesoTotal += parseFloat(item.pesoToneladas);

    const op = item.tipoOperacao ? item.tipoOperacao.toUpperCase() : 'OUTRO';
    if (['CARREGAMENTO', 'ENTREGA'].includes(op)) carregamentoEntregaCount++;

    contagemOperacoes[op] = (contagemOperacoes[op] || 0) + 1;

    const st = item.status || 'INDEFINIDO';
    contagemStatus[st] = (contagemStatus[st] || 0) + 1;

    const dt = item.dataCadastro || 'Outros';
    contagemDatas[dt] = (contagemDatas[dt] || 0) + 1;

    if (tbody) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${item.atendimentoId}</strong></td>
        <td>${item.placa}</td>
        <td>${item.motorista}</td>
        <td>${item.tipoOperacao}</td>
        <td>${item.doca || '-'}</td>
        <td><strong>${item.pesoToneladas ? item.pesoToneladas + ' t' : '-'}</strong></td>
        <td>${item.dataCadastro} ${item.horarioCadastro}</td>
        <td><span class="badge-status status-${item.status}">${item.status}</span></td>
        <td class="text-center whitespace-nowrap">
          <button class="btn btn-outline btn-sm" onclick="window.prepararEdicaoViaAdmin('${item.idFirestore}')">✏️ Editar</button>
        </td>
      `;
      tbody.appendChild(tr);
    }
  });

  // Atualização dos Cartões KPI Logísticos da Transportadora
  const qtdTotal = lista.length;
  const pesoMedio = qtdTotal > 0 ? (pesoTotal / qtdTotal) : 0;
  const percentualOcupacao = Math.min(Math.round((doca / 20) * 100), 100);
  const veiculosNoPatio = espera + chamados + doca;

  if (document.getElementById('kpi-total-volume')) document.getElementById('kpi-total-volume').innerText = `${pesoTotal.toFixed(2).replace('.', ',')} t`;
  if (document.getElementById('kpi-qtd-atendimentos')) document.getElementById('kpi-qtd-atendimentos').innerText = qtdTotal;
  if (document.getElementById('kpi-peso-medio')) document.getElementById('kpi-peso-medio').innerText = `${pesoMedio.toFixed(2).replace('.', ',')} t`;
  if (document.getElementById('kpi-aproveitamento-docas')) document.getElementById('kpi-aproveitamento-docas').innerText = `${((doca / 20) * 100).toFixed(2).replace('.', ',')}%`;

  if (document.getElementById('kpi-veiculos-patio')) document.getElementById('kpi-veiculos-patio').innerText = veiculosNoPatio;
  if (document.getElementById('kpi-ocupacao-doca')) document.getElementById('kpi-ocupacao-doca').innerText = `${percentualOcupacao}%`;
  if (document.getElementById('kpi-entregas-carregamentos')) document.getElementById('kpi-entregas-carregamentos').innerText = carregamentoEntregaCount;
  if (document.getElementById('kpi-aguardando-chamada')) document.getElementById('kpi-aguardando-chamada').innerText = espera;

  if (document.getElementById('kpi-saidas-liberadas')) document.getElementById('kpi-saidas-liberadas').innerText = saidaLiberada;
  if (document.getElementById('kpi-ocorrencias')) document.getElementById('kpi-ocorrencias').innerText = 0; // Indicador de ocorrências
  if (document.getElementById('kpi-pendentes-checkin')) document.getElementById('kpi-pendentes-checkin').innerText = cadastradoSemCheckin;

  // Renderizar Todos os Gráficos
  renderizarGraficoEvolucaoTemporal(contagemDatas);
  renderizarGraficoPizzaOperacoes(contagemOperacoes);
  renderizarGraficoRoscaStatus(contagemStatus);
  renderizarGraficoGaugeOcupacao(percentualOcupacao);
}

// 1. GRÁFICO DE LINHAS / EVOLUÇÃO TEMPORAL
function renderizarGraficoEvolucaoTemporal(dadosDatas) {
  const ctx = document.getElementById('graficoEvolucaoTemporal')?.getContext('2d');
  if (!ctx) return;

  if (graficoEvolucao) graficoEvolucao.destroy();

  const tipo = document.getElementById('tipo-grafico-select')?.value || 'line';
  const labels = Object.keys(dadosDatas);
  const valores = Object.values(dadosDatas);

  graficoEvolucao = new Chart(ctx, {
    type: tipo,
    data: {
      labels: labels,
      datasets: [{
        label: 'Atendimentos por Dia',
        data: valores,
        borderColor: '#0a3d62',
        backgroundColor: 'rgba(10, 61, 98, 0.15)',
        fill: true,
        tension: 0.3,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        datalabels: {
          color: '#0a3d62',
          font: { weight: 'bold' }
        }
      },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
    }
  });
}

// 2. GRÁFICO DE PIZZA (OPERAÇÕES) COM PORCENTAGEM
function renderizarGraficoPizzaOperacoes(dadosOp) {
  const ctx = document.getElementById('graficoPizzaOperacoes')?.getContext('2d');
  if (!ctx) return;

  if (graficoPizza) graficoPizza.destroy();

  const labels = Object.keys(dadosOp);
  const valores = Object.values(dadosOp);
  const cores = labels.map(l => OPERACAO_CORES[l] || '#7f8c8d');

  graficoPizza = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [{
        data: valores,
        backgroundColor: cores
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        datalabels: {
          color: '#ffffff',
          font: { weight: 'bold', size: 12 },
          formatter: (value, ctx) => {
            const sum = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
            const percentage = sum > 0 ? ((value * 100) / sum).toFixed(1) + "%" : "0%";
            return `${value}\n(${percentage})`;
          }
        }
      }
    }
  });
}

// 3. GRÁFICO DE ROSCA (STATUS) COM PORCENTAGEM
function renderizarGraficoRoscaStatus(dadosStatus) {
  const ctx = document.getElementById('graficoRoscaStatus')?.getContext('2d');
  if (!ctx) return;

  if (graficoRosca) graficoRosca.destroy();

  const labels = Object.keys(dadosStatus);
  const valores = Object.values(dadosStatus);

  graficoRosca = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: valores,
        backgroundColor: ['#fef3c7', '#fed7aa', '#dbeafe', '#e0e7ff', '#d1fae5', '#10b981']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        datalabels: {
          color: '#1e293b',
          font: { weight: 'bold', size: 11 },
          formatter: (value, ctx) => {
            const sum = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
            const percentage = sum > 0 ? ((value * 100) / sum).toFixed(1) + "%" : "0%";
            return percentage;
          }
        }
      }
    }
  });
}

// 4. GRÁFICO DE MEDIDOR (GAUGE DE OCUPAÇÃO) COM PORCENTAGEM
function renderizarGraficoGaugeOcupacao(percentual) {
  const ctx = document.getElementById('graficoGaugeOcupacao')?.getContext('2d');
  if (!ctx) return;

  if (graficoGauge) graficoGauge.destroy();

  graficoGauge = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Ocupado (%)', 'Livre (%)'],
      datasets: [{
        data: [percentual, 100 - percentual],
        backgroundColor: ['#e74c3c', '#2ecc71'],
        circumference: 180,
        rotation: 270
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'bottom' },
        datalabels: {
          color: '#ffffff',
          font: { weight: 'bold', size: 13 },
          formatter: (value) => `${value}%`
        }
      }
    }
  });
}

window.prepararEdicaoViaAdmin = function(docId) {
  const item = historicoCompleto.find(i => i.idFirestore === docId);
  if (!item) return;

  window.navegarPara('aba-entrada');
  carregarDadosFormularioEdicao(docId, item);
};

// 11. EXPORTAÇÃO PARA EXCEL (.XLSX)
window.exportarParaExcelXLSX = function() {
  if (!historicoExibido || historicoExibido.length === 0) {
    alert("Nenhum dado disponível para exportação.");
    return;
  }

  const dadosExcel = historicoExibido.map(item => ({
    "ID Atendimento": item.atendimentoId || "",
    "Placa": item.placa || "",
    "Tipo Veículo": item.tipoVeiculo || "",
    "Motorista": item.motorista || "",
    "CPF Motorista": item.documentoMotorista || "",
    "Telefone": item.telefone || "",
    "Operação": item.tipoOperacao || "",
    "Nº OP": item.numeroOp || "",
    "Nº Carga / NF": item.numeroCarga || "",
    "Transportadora": item.transportadora || "",
    "Cliente": item.cliente || "",
    "Doca": item.doca || "Pátio",
    "Peso (t)": item.pesoToneladas || 0,
    "Status": item.status || "",
    "Data Cadastro": item.dataCadastro || "",
    "Hora Cadastro": item.horarioCadastro || ""
  }));

  const ws = XLSX.utils.json_to_sheet(dadosExcel);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Relatorio_Patio");

  const dataAtual = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Relatorio_Transportadora_${dataAtual}.xlsx`);
};

window.carregarRelatoriosSalvosFirebase = async function() {
  const tbody = document.getElementById('tbody-relatorios-salvos');
  if (!tbody) return;

  try {
    const snap = await getDocs(collection(db, COLECAO_RELATORIOS));
    tbody.innerHTML = "";

    if (snap.empty) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center">Nenhum relatório salvo no banco de dados.</td></tr>`;
      return;
    }

    snap.forEach(docSnap => {
      const data = docSnap.data();
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${data.nome}</strong></td>
        <td>${formatDateTime(data.criadoEm)}</td>
        <td>${data.quantidadeRegistros} registros</td>
        <td>
          <button class="btn btn-success btn-sm" onclick="window.baixarRelatorioFirebaseXLSX('${docSnap.id}')">
            📥 Baixar Excel (.xlsx)
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error("Erro ao carregar relatórios:", err);
  }
};

window.baixarRelatorioFirebaseXLSX = async function(idRelatorio) {
  try {
    const docRef = doc(db, COLECAO_RELATORIOS, idRelatorio);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) return alert("Relatório não localizado.");

    const data = docSnap.data();
    const ws = XLSX.utils.json_to_sheet(data.dadosSnapshot);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatorio");

    XLSX.writeFile(wb, `${data.nome.replace(/[^a-zA-Z0-9]/g, "_")}.xlsx`);
  } catch (err) {
    alert("Erro ao baixar relatório salvo: " + err.message);
  }
};

window.imprimirRelatorioAdmin = function(tipo) {
  const listaParaImprimir = tipo === 'geral' ? historicoCompleto : historicoExibido;

  if (listaParaImprimir.length === 0) return alert("Nenhum registro para imprimir.");

  const win = window.open('', '_blank', 'width=900,height=700');
  let linhasHtml = '';

  listaParaImprimir.forEach(item => {
    linhasHtml += `
      <tr>
        <td>${item.atendimentoId}</td>
        <td>${item.placa}</td>
        <td>${item.motorista}</td>
        <td>${item.tipoOperacao}</td>
        <td>${item.numeroOp || '-'}</td>
        <td>${item.doca || '-'}</td>
        <td>${item.pesoToneladas ? item.pesoToneladas + ' t' : '-'}</td>
        <td>${item.dataCadastro} ${item.horarioCadastro}</td>
        <td>${item.status}</td>
      </tr>
    `;
  });

  win.document.write(`
    <html>
      <head>
        <title>Relatório - Transportadora</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
        </style>
      </head>
      <body>
        <h2>TRANSPORTADORA - RELATÓRIO DE OPERAÇÕES</h2>
        <p>Total: ${listaParaImprimir.length} registros</p>
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Placa</th><th>Motorista</th><th>Operação</th><th>OP</th><th>Doca</th><th>Peso (t)</th><th>Data/Hora</th><th>Status</th>
            </tr>
          </thead>
          <tbody>${linhasHtml}</tbody>
        </table>
        <script>window.onload = function() { window.print(); };<\/script>
      </body>
    </html>
  `);
  win.document.close();
};