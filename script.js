import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  updateDoc, 
  query, 
  where, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { analisarPesagem, gerarResumoOperacional } from "./assistente.js";

const firebaseConfig = {
  apiKey: "AIzaSyBXGqn85J6RDkpNCr-_z31MM4LPhROg6zI",
  authDomain: "projetotransportadora-828a3.firebaseapp.com",
  projectId: "projetotransportadora-828a3",
  storageBucket: "projetotransportadora-828a3.firebasestorage.app",
  messagingSenderId: "845742289661",
  appId: "1:845742289661:web:8a834f453215330560c494"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let operacaoAtualId = null;

// Gestão de Sessão do Usuário
onAuthStateChanged(auth, (user) => {
  const isLoginPage = window.location.pathname.includes("login.html");
  if (!user && !isLoginPage) {
    window.location.href = "login.html";
  }
});

window.fazerLogin = function(email, senha) {
  signInWithEmailAndPassword(auth, email, senha)
    .then(() => window.location.href = "index.html")
    .catch((erro) => alert("Falha na autenticação: " + erro.message));
};

document.getElementById('btn-logout')?.addEventListener('click', () => {
  signOut(auth).then(() => window.location.href = "login.html");
});

function gerarNumeroOP() {
  const data = new Date();
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  const aleatorio = Math.floor(1000 + Math.random() * 9000);
  return `OP-${ano}${mes}${dia}-${aleatorio}`;
}

// 1. REGISTRO DE ENTRADA (PORTARIA)
window.salvarEntrada = async function() {
  const placa = document.getElementById('placa-veiculo').value.toUpperCase().trim();
  const operacao = document.getElementById('tipo-operacao').value;
  const motorista = document.getElementById('nome-motorista').value.trim();
  const cpfMotorista = document.getElementById('cpf-motorista').value.trim();
  const ajudante = document.getElementById('nome-ajudante').value.trim();
  const cpfAjudante = document.getElementById('cpf-ajudante').value.trim();

  if (!placa || !motorista || !cpfMotorista) {
    alert("Preencha todos os campos obrigatórios.");
    return;
  }

  const numeroOP = gerarNumeroOP();
  const dataHoraAtual = new Date().toLocaleString('pt-BR');

  const dadosEntrada = {
    op: numeroOP,
    placa: placa,
    operacao: operacao,
    motorista: motorista,
    cpfMotorista: cpfMotorista,
    ajudante: ajudante || "N/A",
    cpfAjudante: cpfAjudante || "N/A",
    status: "ENTRADA_REGISTRADA",
    dataEntrada: serverTimestamp()
  };

  try {
    await addDoc(collection(db, "operacoes"), dadosEntrada);

    document.getElementById('ticket-op').innerText = numeroOP;
    document.getElementById('ticket-placa').innerText = placa;
    document.getElementById('ticket-motorista').innerText = motorista;
    document.getElementById('ticket-operacao').innerText = operacao;
    document.getElementById('ticket-data').innerText = dataHoraAtual;

    const qrContainer = document.getElementById('qrcode-container');
    qrContainer.innerHTML = "";
    if (typeof QRCode !== "undefined") {
      new QRCode(qrContainer, { text: numeroOP, width: 170, height: 170 });
    }

    document.getElementById('area-ticket').classList.remove('hidden');
    document.getElementById('form-entrada').reset();
  } catch (erro) {
    console.error("Erro ao salvar operação:", erro);
    alert("Erro ao gravar entrada.");
  }
};

window.gerarQRDireto = function() {
  const placa = document.getElementById('placa-veiculo').value.toUpperCase().trim() || "SEM PLACA";
  const motorista = document.getElementById('nome-motorista').value.trim() || "SEM NOME";
  const operacao = document.getElementById('tipo-operacao').value;
  const numeroOP = gerarNumeroOP();

  document.getElementById('ticket-op').innerText = numeroOP;
  document.getElementById('ticket-placa').innerText = placa;
  document.getElementById('ticket-motorista').innerText = motorista;
  document.getElementById('ticket-operacao').innerText = operacao;
  document.getElementById('ticket-data').innerText = new Date().toLocaleString('pt-BR');

  const qrContainer = document.getElementById('qrcode-container');
  qrContainer.innerHTML = "";
  if (typeof QRCode !== "undefined") {
    new QRCode(qrContainer, { text: numeroOP, width: 170, height: 170 });
  }

  document.getElementById('area-ticket').classList.remove('hidden');
};

// 2. BUSCA DE OPERAÇÃO
window.buscarOP = async function() {
  const opBusca = document.getElementById('input-buscar-op').value.trim();
  if (!opBusca) return alert("Informe a OP.");

  try {
    const q = query(collection(db, "operacoes"), where("op", "==", opBusca));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      alert("Operação não encontrada.");
      return;
    }

    const docSnapshot = querySnapshot.docs[0];
    operacaoAtualId = docSnapshot.id;
    const data = docSnapshot.data();

    document.getElementById('resumo-op').innerText = data.op;
    document.getElementById('resumo-placa').innerText = data.placa;
    document.getElementById('resumo-motorista').innerText = data.motorista;
    document.getElementById('resumo-operacao').innerText = data.operacao;

    document.getElementById('secao-finalizacao').classList.remove('hidden');
  } catch (erro) {
    console.error("Erro ao buscar OP:", erro);
  }
};

// 3. BALANÇA E FINALIZAÇÃO DE SAÍDA
window.finalizarOperacao = async function() {
  if (!operacaoAtualId) return alert("Nenhuma operação selecionada.");

  const conferente = document.getElementById('nome-conferente').value.trim();
  const horario = document.getElementById('horario-conferencia').value;
  const pesoFinal = parseFloat(document.getElementById('peso-final').value);

  const analise = analisarPesagem(pesoFinal);
  if (!analise.statusValido) {
    alert(analise.alerta);
    return;
  }

  try {
    const docRef = doc(db, "operacoes", operacaoAtualId);
    await updateDoc(docRef, {
      status: "CONCLUIDO",
      pesagemSaida: {
        pesoFinal: pesoFinal,
        conferente: conferente,
        horarioConferencia: horario,
        dataHora: serverTimestamp()
      }
    });

    alert("Operação finalizada e veículo liberado com sucesso!");
    document.getElementById('secao-finalizacao').classList.add('hidden');
    document.getElementById('form-finalizar-op').reset();
    operacaoAtualId = null;
  } catch (erro) {
    console.error("Erro ao finalizar operação:", erro);
    alert("Erro ao gravar saída.");
  }
};

// 4. MÉTODOS DO PAINEL ADMINISTRATIVO
window.carregarHistoricoOperacoes = async function() {
  const tbody = document.getElementById('tbody-historico');
  if (!tbody) return;

  try {
    const querySnapshot = await getDocs(collection(db, "operacoes"));
    tbody.innerHTML = "";
    const listaOperacoes = [];

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      listaOperacoes.push(data);

      const tr = document.createElement('tr');
      tr.style.borderBottom = "1px solid #e1e8ef";
      
      const dataEntradaStr = data.dataEntrada?.toDate?.() 
        ? data.dataEntrada.toDate().toLocaleString('pt-BR') 
        : "N/A";

      tr.innerHTML = `
        <td style="padding: 10px;"><strong>${data.op || '--'}</strong></td>
        <td style="padding: 10px;">${data.placa || '--'}</td>
        <td style="padding: 10px;">${data.motorista || '--'}</td>
        <td style="padding: 10px;">${dataEntradaStr}</td>
        <td style="padding: 10px;">${data.pesagemSaida?.pesoFinal || 'Pendente'}</td>
        <td style="padding: 10px;"><span>${data.status || 'ENTRADA'}</span></td>
      `;
      tbody.appendChild(tr);
    });

    // Atualiza Cartões do Dashboard
    const resumo = gerarResumoOperacional(listaOperacoes);
    if (document.getElementById('stat-patio')) {
      document.getElementById('stat-patio').innerText = resumo.totalPatio;
      document.getElementById('stat-carregando').innerText = resumo.emCarregamento;
      document.getElementById('stat-finalizados').innerText = resumo.concluidosHoje;
    }
  } catch (erro) {
    console.error("Erro ao carregar histórico:", erro);
  }
};

// Executa ao carregar a página admin
if (window.location.pathname.includes("administrativo.html")) {
  window.addEventListener('DOMContentLoaded', () => {
    window.carregarHistoricoOperacoes();
  });
}