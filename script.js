import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, collection, addDoc, getDocs, doc, getDoc, updateDoc, query, where, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ==========================================================================
// CONFIGURAÇÃO DO FIREBASE
// ==========================================================================
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

let operacaoAtualId = null;
let html5QrScanner = null;
let isProcessingQr = false;
let meuGrafico = null;

// Armazenamento global das métricas do gráfico
let qtdCargaGlobal = 0;
let qtdDescargaGlobal = 0;

const QR_PREFIX = "VEHICLE_RECORD:";

// ==========================================================================
// MÁSCARAS E FORMATAÇÃO DE CAMPOS (NOME MAIÚSCULO E CPF COM PONTUAÇÃO)
// ==========================================================================
function aplicarCapitalizacao(texto) {
  return texto
    .toLowerCase()
    .split(' ')
    .map(palavra => palavra.charAt(0).toUpperCase() + palavra.slice(1))
    .join(' ');
}

function aplicarMascaraCPF(valor) {
  return valor
    .replace(/\D/g, '')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
    .substring(0, 14);
}

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

// ==========================================================================
// NAVEGAÇÃO SPA
// ==========================================================================
window.navegarPara = function(idAba) {
  document.querySelectorAll('.aba-conteudo').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));

  const abaAlvo = document.getElementById(idAba);
  if (abaAlvo) abaAlvo.classList.remove('hidden');

  const linkAtivo = Array.from(document.querySelectorAll('.nav-link')).find(a => a.getAttribute('onclick')?.includes(idAba));
  if (linkAtivo) linkAtivo.classList.add('active');

  window.pararCamera();

  if (idAba === 'aba-admin') {
    window.carregarHistoricoOperacoes();
  }
};

// ==========================================================================
// UTILS DE DATA E FORMATOS
// ==========================================================================
function formatDateTime(timestamp) {
  if (!timestamp) return "--/--/---- --:--";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function extractDocumentId(qrValue) {
  if (!qrValue || typeof qrValue !== "string" || !qrValue.startsWith(QR_PREFIX)) {
    throw new Error("QR Code inválido. Utilize um QR Code gerado pelo sistema.");
  }
  return qrValue.replace(QR_PREFIX, "").trim();
}

function gerarNumeroOP() {
  const d = new Date();
  return `OP-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${Math.floor(1000 + Math.random() * 9000)}`;
}

// ==========================================================================
// AUTENTICAÇÃO
// ==========================================================================
onAuthStateChanged(auth, (user) => {
  if (!user) {
    document.getElementById('nav-menu').style.display = 'none';
    window.navegarPara('aba-login');
  } else {
    document.getElementById('nav-menu').style.display = 'flex';
    if (!document.getElementById('aba-login').classList.contains('hidden')) {
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

// ==========================================================================
// 1. ENTRADA DE VEÍCULOS
// ==========================================================================
window.salvarEntrada = async function() {
  const placa = document.getElementById('placa-veiculo')?.value.toUpperCase().trim();
  const tipoVeiculo = document.getElementById('tipo-veiculo')?.value;
  const operacao = document.getElementById('tipo-operacao')?.value;
  const motorista = document.getElementById('nome-motorista')?.value.trim();
  const cpfMotorista = document.getElementById('cpf-motorista')?.value.trim();
  const ajudante = document.getElementById('nome-ajudante')?.value.trim();
  const cpfAjudante = document.getElementById('cpf-ajudante')?.value.trim();

  if (!placa || !tipoVeiculo || !motorista || !cpfMotorista) {
    alert("Preencha todos os campos obrigatórios.");
    return;
  }

  const numeroOP = gerarNumeroOP();
  const agora = serverTimestamp();

  const dadosEntrada = {
    op: numeroOP,
    placaVeiculo: placa,
    tipoVeiculo: tipoVeiculo,
    tipoOperacao: operacao,
    motorista: motorista,
    cpfMotorista: cpfMotorista,
    ajudante: ajudante || "N/A",
    cpfAjudante: cpfAjudante || "N/A",
    horarioEntrada: agora,
    status: "ENTRADA_REGISTRADA",
    criadoEm: agora
  };

  try {
    const docRef = await addDoc(collection(db, "operacoes"), dadosEntrada);
    const qrPayload = `${QR_PREFIX}${docRef.id}`;

    await updateDoc(docRef, { qrCode: qrPayload });

    document.getElementById('ticket-op').innerText = numeroOP;
    document.getElementById('ticket-placa').innerText = placa;
    document.getElementById('ticket-motorista').innerText = motorista;
    document.getElementById('ticket-operacao').innerText = operacao;
    document.getElementById('ticket-data').innerText = new Date().toLocaleString('pt-BR');

    const qrContainer = document.getElementById('qrcode-container');
    if (qrContainer) {
      qrContainer.innerHTML = "";
      if (typeof QRCode !== "undefined") {
        new QRCode(qrContainer, { text: qrPayload, width: 170, height: 170 });
      }
    }

    document.getElementById('area-ticket')?.classList.remove('hidden');
    document.getElementById('form-entrada')?.reset();
  } catch (erro) {
    console.error("Erro ao salvar entrada:", erro);
    alert("Erro ao gravar entrada no banco de dados.");
  }
};

// ==========================================================================
// 2. CARREGAMENTO E DESCARGA
// ==========================================================================
window.habilitarCamera = async function() {
  const alertBox = document.getElementById("scanner-alert");
  const readerArea = document.getElementById("reader");

  try {
    if (alertBox) alertBox.classList.add("hidden");
    html5QrScanner = new Html5Qrcode("reader");
    if (readerArea) readerArea.classList.remove("hidden");

    await html5QrScanner.start(
      { facingMode: { ideal: "environment" } },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      async (qrCodeMessage) => {
        if (isProcessingQr) return;
        isProcessingQr = true;
        await window.pararCamera();
        await processarLeituraQRCode(qrCodeMessage);
        isProcessingQr = false;
      },
      () => {}
    );
  } catch (err) {
    await window.pararCamera();
    if (alertBox) {
      alertBox.textContent = err.message || "Erro ao acessar câmera.";
      alertBox.className = "alert alert-danger";
      alertBox.classList.remove("hidden");
    }
  }
};

window.pararCamera = async function() {
  const readerArea = document.getElementById("reader");
  if (html5QrScanner) {
    try { await html5QrScanner.stop(); } catch (e) {}
    html5QrScanner.clear();
    html5QrScanner = null;
  }
  if (readerArea) readerArea.classList.add("hidden");
};

async function processarLeituraQRCode(qrValue) {
  try {
    const documentId = extractDocumentId(qrValue);
    await carregarOperacaoPorDocId(documentId);
  } catch (err) {
    alert(err.message);
  }
}

window.buscarOPManual = async function() {
  const op = document.getElementById('busca-op-carregamento')?.value.trim();
  if (!op) return alert("Informe a OP.");

  try {
    const q = query(collection(db, "operacoes"), where("op", "==", op));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) return alert("Operação não encontrada.");

    const docSnap = querySnapshot.docs[0];
    carregarDadosDoca(docSnap.id, docSnap.data());
  } catch (e) {
    alert("Erro ao buscar OP.");
  }
};

async function carregarOperacaoPorDocId(docId) {
  const docSnapshot = await getDoc(doc(db, "operacoes", docId));
  if (!docSnapshot.exists()) throw new Error("Registro não encontrado.");
  carregarDadosDoca(docSnapshot.id, docSnapshot.data());
}

function carregarDadosDoca(id, data) {
  operacaoAtualId = id;
  document.getElementById('carr-op').innerText = data.op || '--';
  document.getElementById('carr-placa').innerText = data.placaVeiculo || '--';
  document.getElementById('carr-motorista').innerText = data.motorista || '--';
  document.getElementById('carr-operacao').innerText = data.tipoOperacao || '--';
  document.getElementById('carr-entrada').innerText = formatDateTime(data.horarioEntrada);

  const agoraISO = new Date().toISOString().slice(0, 16);
  document.getElementById('dataHorarioProcesso').value = agoraISO;

  if (data.status === "EM_CARREGAMENTO" || data.status === "EM_DESCARGA") {
    document.getElementById('fase-inicio').classList.add('hidden');
    document.getElementById('fase-fim').classList.remove('hidden');
  } else if (data.status === "ENTRADA_REGISTRADA") {
    document.getElementById('fase-inicio').classList.remove('hidden');
    document.getElementById('fase-fim').classList.add('hidden');
  } else {
    alert("Esta operação já passou da fase de doca!");
    return;
  }

  document.getElementById('secao-processo-carregamento').classList.remove('hidden');
}

window.iniciarEtapaCarregamento = async function() {
  if (!operacaoAtualId) return;
  const docRef = doc(db, "operacoes", operacaoAtualId);
  const snap = await getDoc(docRef);
  const tipo = snap.data().tipoOperacao;

  const novoStatus = tipo === "CARREGAMENTO" ? "EM_CARREGAMENTO" : "EM_DESCARGA";

  try {
    await updateDoc(docRef, {
      status: novoStatus,
      inicioDoca: serverTimestamp()
    });
    alert("Etapa iniciada! Preencha as informações para passar para a próxima fase.");
    document.getElementById('fase-inicio').classList.add('hidden');
    document.getElementById('fase-fim').classList.remove('hidden');
  } catch (e) {
    alert("Erro ao atualizar status.");
  }
};

window.finalizarEtapaCarregamento = async function() {
  if (!operacaoAtualId) return;
  const dataHorario = document.getElementById('dataHorarioProcesso').value;
  const conferente = document.getElementById('nomeConferente').value.trim();
  const obs = document.getElementById('observacoesConferencia').value.trim();

  if (!dataHorario || !conferente) {
    return alert("Preencha a data/horário e o nome do conferente para prosseguir.");
  }

  try {
    const docRef = doc(db, "operacoes", operacaoAtualId);
    const snap = await getDoc(docRef);
    const opNumero = snap.data().op;

    await updateDoc(docRef, {
      status: "AGUARDANDO_BALANCA_SAIDA",
      fimDocaDataHorario: dataHorario,
      conferenteDoca: conferente,
      observacoesDoca: obs
    });

    alert("Processo concluído com sucesso! Redirecionando para a Balança de Saída.");
    
    document.getElementById('secao-processo-carregamento').classList.add('hidden');
    operacaoAtualId = null;

    window.navegarPara('aba-balanca');
    const inputBalanca = document.getElementById('input-buscar-op');
    if (inputBalanca && opNumero) {
      inputBalanca.value = opNumero;
      window.buscarOPBalanca();
    }
  } catch (e) {
    alert("Erro ao finalizar etapa.");
  }
};

// ==========================================================================
// 3. BALANÇA SAÍDA
// ==========================================================================
window.buscarOPBalanca = async function() {
  const opBusca = document.getElementById('input-buscar-op')?.value.trim();
  if (!opBusca) return alert("Informe a OP.");

  try {
    const q = query(collection(db, "operacoes"), where("op", "==", opBusca));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) return alert("Operação não encontrada.");

    const docSnapshot = querySnapshot.docs[0];
    const data = docSnapshot.data();

    if (data.status !== "AGUARDANDO_BALANCA_SAIDA") {
      return alert("Esta operação precisa passar primeiro pela etapa de Carregamento/Descarga.");
    }

    operacaoAtualId = docSnapshot.id;

    document.getElementById('resumo-op').innerText = data.op || '--';
    document.getElementById('resumo-placa').innerText = data.placaVeiculo || '--';
    document.getElementById('resumo-motorista').innerText = data.motorista || '--';
    document.getElementById('resumo-operacao').innerText = data.tipoOperacao || '--';

    document.getElementById('data-horario-saida').value = new Date().toISOString().slice(0, 16);
    document.getElementById('secao-finalizacao')?.classList.remove('hidden');
  } catch (erro) {
    console.error(erro);
  }
};

window.finalizarOperacao = async function() {
  if (!operacaoAtualId) return alert("Nenhuma operação selecionada.");

  const conferente = document.getElementById('nome-conferente')?.value.trim();
  const dataHorarioSaida = document.getElementById('data-horario-saida')?.value;
  const pesoFinal = parseFloat(document.getElementById('peso-final')?.value);

  if (!conferente || !dataHorarioSaida || isNaN(pesoFinal) || pesoFinal <= 0) {
    alert("Preencha corretamente o nome do conferente, data/horário e peso de saída.");
    return;
  }

  try {
    const docRef = doc(db, "operacoes", operacaoAtualId);
    const agora = serverTimestamp();

    await updateDoc(docRef, {
      horarioSaida: agora,
      status: "CONCLUIDO",
      pesagemSaida: {
        pesoFinal: pesoFinal,
        conferente: conferente,
        dataHorarioSaida: dataHorarioSaida
      }
    });

    alert("Operação finalizada e veículo liberado com sucesso!");
    
    document.getElementById('secao-finalizacao')?.classList.add('hidden');
    document.getElementById('form-finalizar-op')?.reset();
    operacaoAtualId = null;

    window.navegarPara('aba-entrada');
  } catch (erro) {
    alert("Erro ao gravar saída no banco.");
  }
};

// ==========================================================================
// 4. PAINEL ADMIN, GRÁFICOS & RELATÓRIOS
// ==========================================================================
window.carregarHistoricoOperacoes = async function() {
  const tbody = document.getElementById('tbody-historico');
  if (!tbody) return;

  try {
    const querySnapshot = await getDocs(collection(db, "operacoes"));
    const lista = [];

    querySnapshot.forEach((docSnap) => {
      lista.push({ id: docSnap.id, ...docSnap.data() });
    });

    renderizarTabelaEGráficos(lista);
  } catch (erro) {
    console.error("Erro ao carregar dados do admin:", erro);
  }
};

function renderizarTabelaEGráficos(lista) {
  const tbody = document.getElementById('tbody-historico');
  if (!tbody) return;

  tbody.innerHTML = "";

  let patio = 0;
  let doca = 0;
  let concluidosHoje = 0;
  qtdCargaGlobal = 0;
  qtdDescargaGlobal = 0;

  const hoje = new Date().toDateString();

  lista.forEach((data) => {
    if (data.status === "ENTRADA_REGISTRADA") patio++;
    if (data.status === "EM_CARREGAMENTO" || data.status === "EM_DESCARGA") doca++;

    if (data.status === "CONCLUIDO") {
      const dSaida = data.horarioSaida?.toDate ? data.horarioSaida.toDate().toDateString() : null;
      if (dSaida === hoje) concluidosHoje++;
    }

    if (data.tipoOperacao === "CARREGAMENTO") qtdCargaGlobal++;
    if (data.tipoOperacao === "DESCARGA") qtdDescargaGlobal++;

    const tr = document.createElement('tr');
    tr.style.borderBottom = "1px solid #e1e8ef";
    tr.innerHTML = `
      <td style="padding: 10px;"><strong>${data.op || '--'}</strong></td>
      <td style="padding: 10px;">${data.placaVeiculo || '--'}</td>
      <td style="padding: 10px;">${data.motorista || '--'}</td>
      <td style="padding: 10px;">${data.tipoOperacao || '--'}</td>
      <td style="padding: 10px;">${formatDateTime(data.horarioEntrada)}</td>
      <td style="padding: 10px;">${data.pesagemSaida?.pesoFinal ? data.pesagemSaida.pesoFinal + ' kg' : 'Pendente'}</td>
      <td style="padding: 10px;"><span>${data.status || 'ENTRADA'}</span></td>
      <td style="padding: 10px; text-align: center;">
        <button class="btn btn-outline" style="padding: 4px 8px; font-size: 0.8rem;" onclick="imprimirComprovanteADM('${data.id}')">
          🖨️ Imprimir / PDF
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const elPatio = document.getElementById('stat-patio');
  const elDoca = document.getElementById('stat-carregando');
  const elFinalizados = document.getElementById('stat-finalizados');

  if (elPatio) elPatio.innerText = patio;
  if (elDoca) elDoca.innerText = doca;
  if (elFinalizados) elFinalizados.innerText = concluidosHoje;

  const tipoSelecionado = document.getElementById('tipo-grafico-select')?.value || 'bar';
  renderizarGrafico(qtdCargaGlobal, qtdDescargaGlobal, tipoSelecionado);
}

function renderizarGrafico(carga, descarga, tipo = 'bar') {
  const ctx = document.getElementById('graficoOperacoes')?.getContext('2d');
  if (!ctx) return;

  if (meuGrafico) {
    meuGrafico.destroy();
  }

  meuGrafico = new Chart(ctx, {
    type: tipo,
    data: {
      labels: ['Carregamento', 'Descarga'],
      datasets: [{
        label: 'Quantidade de Operações',
        data: [carga, descarga],
        backgroundColor: tipo === 'line' ? 'rgba(10, 61, 98, 0.2)' : ['#0a3d62', '#3c6382'],
        borderColor: '#0a3d62',
        borderWidth: 2,
        fill: tipo === 'line'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 } }
      }
    }
  });
}

window.alterarTipoGrafico = function(tipo) {
  renderizarGrafico(qtdCargaGlobal, qtdDescargaGlobal, tipo);
};

window.filtrarRelatorio = async function() {
  const dtInicio = document.getElementById('filtro-data-inicio')?.value;
  const dtFim = document.getElementById('filtro-data-fim')?.value;
  const tipoOp = document.getElementById('filtro-tipo-operacao')?.value || 'TODOS';

  try {
    const querySnapshot = await getDocs(collection(db, "operacoes"));
    const filtrados = [];

    const dInicio = dtInicio ? new Date(dtInicio + 'T00:00:00') : null;
    const dFim = dtFim ? new Date(dtFim + 'T23:59:59') : null;

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      let atendeData = true;
      let atendeTipo = true;

      if (dInicio && dFim && data.horarioEntrada) {
        const dtEntrada = data.horarioEntrada.toDate ? data.horarioEntrada.toDate() : new Date(data.horarioEntrada);
        atendeData = dtEntrada >= dInicio && dtEntrada <= dFim;
      }

      if (tipoOp !== 'TODOS') {
        atendeTipo = data.tipoOperacao === tipoOp;
      }

      if (atendeData && atendeTipo) {
        filtrados.push({ id: docSnap.id, ...data });
      }
    });

    renderizarTabelaEGráficos(filtrados);
  } catch (e) {
    alert("Erro ao filtrar relatório.");
  }
};

window.imprimirRelatorioGeral = function() {
  window.print();
};

// Configuração de ouvintes quando o DOM está carregado
document.addEventListener('DOMContentLoaded', () => {
  const selectTipo = document.getElementById('tipo-grafico-select');
  if (selectTipo) {
    selectTipo.addEventListener('change', (e) => {
      window.alterarTipoGrafico(e.target.value);
    });
  }
});

// ==========================================================================
// 5. GERADOR DE IMPRESSÃO / PDF PARA ADMINISTRADOR
// ==========================================================================
window.imprimirComprovanteADM = async function(docId) {
  try {
    const docRef = doc(db, "operacoes", docId);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      alert("Registro não encontrado.");
      return;
    }

    const data = snap.data();

    const win = window.open('', '_blank', 'width=800,height=900');
    
    win.document.write(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Comprovante - ${data.op || 'Operação'}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 30px; color: #333; line-height: 1.5; }
          .header { text-align: center; border-bottom: 2px solid #0a3d62; padding-bottom: 15px; margin-bottom: 20px; }
          .header h2 { margin: 0; color: #0a3d62; }
          .header p { margin: 5px 0 0 0; font-size: 14px; color: #666; }
          .section-title { background: #f1f4f8; padding: 6px 10px; font-weight: bold; border-left: 4px solid #0a3d62; margin-top: 20px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
          .row { font-size: 14px; }
          .label { font-weight: bold; color: #555; }
          .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #888; border-top: 1px solid #ddd; padding-top: 10px; }
          @media print {
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>TRANSPORTADORA PAULÃO</h2>
          <p>Relatório de Operação de Pátio & Balança</p>
        </div>

        <div class="section-title">DADOS DA OPERAÇÃO</div>
        <div class="grid">
          <div class="row"><span class="label">Nº OP:</span> ${data.op || '--'}</div>
          <div class="row"><span class="label">Status:</span> ${data.status || '--'}</div>
          <div class="row"><span class="label">Tipo de Operação:</span> ${data.tipoOperacao || '--'}</div>
          <div class="row"><span class="label">Data de Entrada:</span> ${formatDateTime(data.horarioEntrada)}</div>
        </div>

        <div class="section-title">DADOS DO VEÍCULO E CONDUTOR</div>
        <div class="grid">
          <div class="row"><span class="label">Placa:</span> ${data.placaVeiculo || '--'}</div>
          <div class="row"><span class="label">Tipo de Veículo:</span> ${data.tipoVeiculo || '--'}</div>
          <div class="row"><span class="label">Motorista:</span> ${data.motorista || '--'}</div>
          <div class="row"><span class="label">CPF Motorista:</span> ${data.cpfMotorista || '--'}</div>
          <div class="row"><span class="label">Ajudante:</span> ${data.ajudante || 'N/A'}</div>
          <div class="row"><span class="label">CPF Ajudante:</span> ${data.cpfAjudante || 'N/A'}</div>
        </div>

        <div class="section-title">CONFERÊNCIA DE DOCA</div>
        <div class="grid">
          <div class="row"><span class="label">Conferente Doca:</span> ${data.conferenteDoca || 'Pendente'}</div>
          <div class="row"><span class="label">Data/Hora Doca:</span> ${data.fimDocaDataHorario || '--'}</div>
          <div class="row" style="grid-column: span 2;"><span class="label">Observações:</span> ${data.observacoesDoca || 'Nenhuma'}</div>
        </div>

        <div class="section-title">PESAGEM E LIBERAÇÃO</div>
        <div class="grid">
          <div class="row"><span class="label">Conferente Saída:</span> ${data.pesagemSaida?.conferente || 'Pendente'}</div>
          <div class="row"><span class="label">Data/Hora Saída:</span> ${data.pesagemSaida?.dataHorarioSaida || '--'}</div>
          <div class="row"><span class="label">Peso Final Saída:</span> ${data.pesagemSaida?.pesoFinal ? data.pesagemSaida.pesoFinal + ' kg' : 'Pendente'}</div>
        </div>

        <div class="footer">
          <p>Documento gerado pelo Sistema de Gestão de Pátio - Transportadora Paulão em ${new Date().toLocaleString('pt-BR')}</p>
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        <\/script>
      </body>
      </html>
    `);

    win.document.close();
  } catch (err) {
    console.error("Erro ao gerar impressão/PDF:", err);
    alert("Falha ao abrir visualização do documento.");
  }
};