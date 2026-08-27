// ==========================================================================
// INICIALIZAÇÃO DO FIREBASE (v9+ ES Modules via CDN)
// ==========================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js"; // Importa módulo de inicialização do aplicativo Firebase
import { 
  getFirestore, collection, addDoc, doc, getDoc, getDocs, updateDoc, 
  query, where, serverTimestamp, orderBy 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js"; // Importa métodos da API do Firestore Database
import { 
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js"; // Importa serviços de Autenticação do Firebase

// Objeto de configuração das chaves de conexão da Transportadora PRocha no Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBXGqn85J6RDkpNCr-_z31MM4LPhROg6zI", // Chave de API pública
  authDomain: "projetotransportadora-828a3.firebaseapp.com", // Domínio de Autenticação
  projectId: "projetotransportadora-828a3", // Identificador único do projeto no GCP/Firebase
  storageBucket: "projetotransportadora-828a3.firebasestorage.app", // Bucket para arquivos
  messagingSenderId: "845742289661", // ID remetente de mensagens
  appId: "1:845742289661:web:8a834f453215330560c494" // ID da Aplicação Web
};

// ... restante do código em script.js permanece idêntico ...

// Renderiza o QR Code e exibe o modal contendo as informações da Transportadora PRocha
function exibirModalQRCode(op, placa, motorista) {
  // ...
}

// Instanciação dos serviços
const app = initializeApp(firebaseConfig); // Inicializa a aplicação com a configuração fornecida
const db = getFirestore(app); // Inicializa a instância do banco Firestore
const auth = getAuth(app); // Inicializa o serviço de autenticação do usuário

let operacaoAtualId = null; // Variável global para armazenar o ID do documento da operação ativa
let html5QrScanner = null; // Instância global do leitor de QR Code de câmera

// ==========================================================================
// MÓDULO DE AUTENTICAÇÃO E CONTROLE DE ACESSO
// ==========================================================================

// Função responsável por efetuar o login com e-mail e senha
window.realizarLogin = async function() {
  const email = document.getElementById('login-email').value.trim(); // Obtém o e-mail digitado no formulário
  const senha = document.getElementById('login-senha').value; // Obtém a senha digitada
  const erroDiv = document.getElementById('login-erro'); // Div de alerta de erro na página de login

  try {
    await signInWithEmailAndPassword(auth, email, senha); // Tenta efetuar o login no Firebase Auth
    window.location.href = "index.html"; // Em caso de sucesso, redireciona para a página principal
  } catch (error) {
    if (erroDiv) {
      erroDiv.textContent = "Erro de autenticação: " + error.message; // Exibe mensagem de erro formatada
      erroDiv.classList.remove('hidden'); // Exibe o alerta
    } else {
      alert("Erro ao efetuar login: " + error.message); // Alerta alternativo via Popup
    }
  }
};

// Monitor do estado da sessão do usuário autenticado
onAuthStateChanged(auth, async (user) => {
  const btnLoginNav = document.getElementById('btn-login-nav'); // Elemento de link de login na barra de navegação
  
  if (user) { // Se houver usuário logado
    if (btnLoginNav) {
      btnLoginNav.textContent = `Sair (${user.email})`; // Altera o texto do botão mostrando o e-mail
      btnLoginNav.onclick = (e) => { // Configura ação de Logout no clique
        e.preventDefault();
        signOut(auth); // Desconecta a conta no Firebase Auth
      };
    }

    try {
      const userDoc = await getDoc(doc(db, "usuarios", user.uid)); // Busca permissões no Firestore
      const isAdmin = userDoc.exists() && userDoc.data().perfil === "ADMINISTRADOR"; // Checa se possui perfil administrador

      document.querySelectorAll('.nav-menu a').forEach(link => { // Percorre links da barra superior
        const href = link.getAttribute('href');
        if (['balanca-entrada.html', 'carregamento.html', 'balanca-saida.html', 'administrativo.html'].includes(href)) {
          link.style.display = isAdmin ? 'inline-block' : 'none'; // Libera visibilidade dos módulos operacionais apenas se for admin
        }
      });
    } catch (err) {
      console.error("Erro ao verificar perfil do usuário:", err); // Exibe erro no console em caso de exceção
    }
  } else { // Se não houver usuário ativo na sessão
    if (btnLoginNav) {
      btnLoginNav.textContent = "Login"; // Restaura texto do botão para "Login"
      btnLoginNav.onclick = null; // Remove a ação de Logout
      btnLoginNav.setAttribute('href', 'login.html'); // Aponta link para página de Login
    }
    
    document.querySelectorAll('.nav-menu a').forEach(link => {
      const href = link.getAttribute('href');
      if (['balanca-entrada.html', 'carregamento.html', 'balanca-saida.html', 'administrativo.html'].includes(href)) {
        link.style.display = 'none'; // Esconde menus operacionais para usuários anônimos
      }
    });
  }
});

// Listener de atalho global Ctrl + P para exibir login administrativo rápido
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && (e.key === 'p' || e.key === 'P')) { // Verifica se pressionou simultaneamente Ctrl + P
    e.preventDefault(); // Impede ação padrão de imprimir tela do navegador
    const modal = document.getElementById('modal-admin-auth'); // Captura a modal de login rápido
    if (modal) {
      modal.classList.remove('hidden'); // Exibe a janela modal
    }
  }
});

// Função para fechar modal de login de admin rápido
window.fecharModalAdmin = function() {
  document.getElementById('modal-admin-auth')?.classList.add('hidden'); // Oculta a modal adicionando classe hidden
};

// Autenticação rápida de admin via modal do atalho Ctrl+P
window.autenticarAdminAtalho = async function() {
  const email = document.getElementById('admin-email').value.trim(); // Obtém e-mail do admin na modal
  const senha = document.getElementById('admin-senha').value; // Obtém a senha digitada

  try {
    const cred = await signInWithEmailAndPassword(auth, email, senha); // Autentica a credencial
    const userDoc = await getDoc(doc(db, "usuarios", cred.user.uid)); // Consulta documento no Firestore
    
    if (userDoc.exists() && userDoc.data().perfil === "ADMINISTRADOR") {
      alert("Autenticação Administrativa realizada com sucesso!"); // Alerta de confirmação
      window.location.href = "administrativo.html"; // Redireciona para o painel gerencial
    } else {
      alert("Acesso não autorizado: O usuário não possui o perfil ADMINISTRADOR no Firestore."); // Nega acesso
    }
  } catch (error) {
    if (error.code === 'auth/invalid-credential') {
      alert("Erro de Autenticação: E-mail ou senha incorretos."); // Erro para dados inválidos
    } else if (error.code === 'auth/user-not-found') {
      alert("Erro de Autenticação: Usuário não encontrado."); // Erro para usuário inexistente
    } else if (error.code === 'auth/wrong-password') {
      alert("Erro de Autenticação: Senha incorreta."); // Erro de senha incorreta
    } else {
      alert("Erro de autenticação: " + error.message); // Exibe mensagem geral da exceção
    }
  }
};

// Função para formatar a entrada de texto com capitalização da primeira letra de cada palavra
window.formatarCapitalizacao = function(element) {
  element.value = element.value.replace(/\b\w/g, l => l.toUpperCase()); // Substitui primeira letra de cada palavra por Maiúscula
};

// ==========================================================================
// MÓDULO 1: ENTRADA DE VEÍCULOS E GERADOR DE OP / QR CODE
// ==========================================================================

// Alterna a exibição dos campos de ajudante dependendo da opção selecionada
window.alternarAjudante = function(possui) {
  const secao = document.getElementById('secao-ajudante'); // Obtém a seção condicional do ajudante
  if (possui) secao.classList.remove('hidden'); // Se Sim, remove a classe oculta
  else secao.classList.add('hidden'); // Se Não, oculta os campos
};

// Gera o número único de operação baseado no padrão: OP-AAAAMMDD-XXXX
function gerarNumeroOperacao() {
  const agora = new Date(); // Obtém a data/hora atual
  const dataStr = agora.toISOString().slice(0,10).replace(/-/g, ''); // Formata a data no formato AAAAMMDD
  const rand = Math.floor(1000 + Math.random() * 9000); // Gera um sufixo numérico aleatório de 4 dígitos
  return `OP-${dataStr}-${rand}`; // Retorna a chave formatada da OP
}

// Cadastra o registro de entrada no banco de dados Firestore
window.cadastrarEntrada = async function() {
  try {
    const placa = document.getElementById('placa').value.toUpperCase(); // Obtém a placa em caracteres maiúsculos
    const tipoVeiculo = document.getElementById('tipoVeiculo').value; // Obtém o tipo de veículo selecionado
    const nomeMotorista = document.getElementById('nomeMotorista').value; // Obtém o nome do motorista
    const cpfMotorista = document.getElementById('cpfMotorista').value; // Obtém o CPF do motorista
    
    const possuiAjudante = document.querySelector('input[name="possuiAjudante"]:checked').value === 'sim'; // Valida se há ajudante
    const nomeAjudante = possuiAjudante ? document.getElementById('nomeAjudante').value : ""; // Captura o nome se houver
    const cpfAjudante = possuiAjudante ? document.getElementById('cpfAjudante').value : ""; // Captura o CPF se houver

    const numOP = gerarNumeroOperacao(); // Invoca gerador de código de operação

    // Objeto contendo o payload da operação a ser gravada no Firestore
    const novaOperacao = {
      numeroOperacao: numOP,
      placa: placa,
      tipoVeiculo: tipoVeiculo,
      motorista: { nome: nomeMotorista, cpf: cpfMotorista },
      nomeMotorista: nomeMotorista,
      cpfMotorista: cpfMotorista,
      ajudante: { possui: possuiAjudante, nome: nomeAjudante, cpf: cpfAjudante },
      status: "ENTRADA_REGISTRADA",
      auditoria: {
        criadoEm: serverTimestamp(), // Registra o horário no servidor do Firebase
        operadorUid: auth.currentUser ? auth.currentUser.uid : "ANONIMO" // Grava o ID do operador
      }
    };

    const docRef = await addDoc(collection(db, "operacoes"), novaOperacao); // Adiciona na coleção 'operacoes'
    await registrarLog(docRef.id, "CADASTRO_ENTRADA", "Veículo registrado na portaria"); // Grava log de auditoria

    exibirModalQRCode(numOP, placa, nomeMotorista); // Exibe o comprovante com o QR Code
  } catch (err) {
    alert("Falha ao registrar entrada: " + err.message); // Exibe alerta de erro se houver falha na gravação
  }
};

// Renderiza o QR Code e exibe o modal contendo as informações da Transportadora Rocha
function exibirModalQRCode(op, placa, motorista) {
  const elOp = document.getElementById('modal-op-numero'); // Captura o elemento do número da OP
  const elPlaca = document.getElementById('modal-placa'); // Captura o elemento da placa
  const elMotorista = document.getElementById('modal-motorista'); // Captura o elemento do motorista

  if (elOp) elOp.innerText = op; // Atualiza o texto da OP na tela
  if (elPlaca) elPlaca.innerText = placa; // Atualiza o texto da Placa
  if (elMotorista) elMotorista.innerText = motorista; // Atualiza o texto do Motorista

  // Formato do texto embutido na leitura do código QR
  const textoQrCode = `OP: ${op}\nPlaca: ${placa}\nMotorista: ${motorista}`;

  const container = document.getElementById('qrcode-container'); // Elemento contêiner do QR Code
  if (container) {
    container.innerHTML = ""; // Limpa qualquer QR Code gerado anteriormente
    new QRCode(container, { 
      text: textoQrCode, // Texto a ser codificado
      width: 180, // Largura em pixels da imagem gerada
      height: 180 // Altura em pixels
    });
  }

  document.getElementById('modal-qrcode')?.classList.remove('hidden'); // Exibe a modal de confirmação removendo a classe hidden
}

// Imprime a folha/modal contendo o QR Code
window.imprimirQRCode = function() {
  window.print(); // Abre a caixa de diálogo nativa de impressão do navegador
};

// Função para fechar a modal do QR Code
window.fecharModalQRCode = function() {
  document.getElementById('modal-qrcode')?.classList.add('hidden'); // Oculta a modal adicionando hidden
};

// ==========================================================================
// MÓDULO 2: LEITURA E CONSULTAS DE QR CODE / OP
// ==========================================================================

// Inicializa a câmera do dispositivo para efetuar a leitura do QR Code
window.iniciarLeitorQRCode = function(elementId, destino) {
  html5QrScanner = new Html5QrcodeScanner(elementId, { fps: 10, qrbox: 250 }); // Instancia o leitor com 10 quadros por segundo
  html5QrScanner.render((qrCodeMessage) => { // Callback executado após uma leitura bem-sucedida
    html5QrScanner.clear(); // Desliga o leitor de vídeo da câmera
    processarOPLocalizada(qrCodeMessage, destino); // Processa os dados lidos do código QR
  }, (error) => {});
};

// Efetua a busca de uma Operação digitada manualmente no input
window.buscarOperacaoManual = function(destino) {
  let fieldId = destino === 'ENTRADA' ? 'busca-op' : (destino === 'CARREGAMENTO' ? 'busca-op-carregamento' : 'busca-op-saida');
  const opValue = document.getElementById(fieldId).value.trim(); // Pega a OP inserida
  if(!opValue) return alert("Digite o número da operação"); // Exibe alerta se o campo estiver vazio
  processarOPLocalizada(opValue, destino); // Executa busca da operação
};

// Processa a leitura de uma OP e atualiza a interface com as informações do Firestore
async function processarOPLocalizada(qrCodeMessage, modulo) {
  try {
    let numeroOP = qrCodeMessage.trim(); // Remove espaços em branco nas bordas da string
    if (numeroOP.includes("\n")) { // Trata textos vindos do QR Code com quebras de linha
      const primeiraLinha = numeroOP.split("\n")[0]; // Seleciona apenas a primeira linha
      numeroOP = primeiraLinha.replace(/^OP:\s*/i, "").trim(); // Remove o prefixo "OP:"
    } else if (numeroOP.toLowerCase().startsWith("op:")) {
      numeroOP = numeroOP.replace(/^OP:\s*/i, "").trim(); // Remove o prefixo se existir
    }

    const q = query(collection(db, "operacoes"), where("numeroOperacao", "==", numeroOP)); // Cria a consulta no Firestore pela OP
    const querySnapshot = await getDocs(q); // Executa a consulta

    if (querySnapshot.empty) {
      return alert("Operação não localizada no Firestore."); // Alerta caso não haja documento equivalente
    }

    const docSnap = querySnapshot.docs[0]; // Captura o primeiro documento encontrado
    const data = docSnap.data(); // Extrai o objeto de dados do documento
    operacaoAtualId = docSnap.id; // Atualiza o ID global da operação em processamento

    let nomeMot = "N/A"; // Valor padrão caso não encontre
    let cpfMot = "N/A"; // Valor padrão

    if (data.motorista && typeof data.motorista === 'object') { // Trata o objeto motorista
      nomeMot = data.motorista.nome || "N/A";
      cpfMot = data.motorista.cpf || "N/A";
    } else if (data.nomeMotorista) { // Trata campo legadizado nomeMotorista
      nomeMot = data.nomeMotorista;
      cpfMot = data.cpfMotorista || "N/A";
    } else if (typeof data.motorista === 'string') {
      nomeMot = data.motorista;
    }

    // Exibe os dados de acordo com o módulo onde a requisição foi aberta
    if (modulo === 'ENTRADA') {
      if (document.getElementById('read-op')) document.getElementById('read-op').innerText = data.numeroOperacao;
      if (document.getElementById('read-placa')) document.getElementById('read-placa').innerText = data.placa;
      if (document.getElementById('read-motorista')) document.getElementById('read-motorista').innerText = nomeMot;
      if (document.getElementById('read-cpf')) document.getElementById('read-cpf').innerText = cpfMot;
      if (document.getElementById('read-ajudante')) {
        document.getElementById('read-ajudante').innerText = (data.ajudante && data.ajudante.possui) ? data.ajudante.nome : "N/A";
      }
      if (document.getElementById('read-status')) document.getElementById('read-status').innerText = data.status;
      document.getElementById('detalhes-operacao')?.classList.remove('hidden'); // Torna o painel visível
    } else if (modulo === 'CARREGAMENTO') {
      if (document.getElementById('carr-op')) document.getElementById('carr-op').innerText = data.numeroOperacao;
      if (document.getElementById('carr-placa')) document.getElementById('carr-placa').innerText = data.placa;
      if (document.getElementById('carr-peso')) document.getElementById('carr-peso').innerText = data.pesagemEntrada ? data.pesagemEntrada.pesoKg : "0";
      document.getElementById('secao-processo-carregamento')?.classList.remove('hidden'); // Exibe a seção do carregamento
    } else if (modulo === 'SAIDA') {
      if (document.getElementById('saida-op')) document.getElementById('saida-op').innerText = data.numeroOperacao;
      if (document.getElementById('saida-placa')) document.getElementById('saida-placa').innerText = data.placa;
      if (document.getElementById('saida-motorista')) document.getElementById('saida-motorista').innerText = nomeMot;
      if (document.getElementById('saida-peso-entrada')) document.getElementById('saida-peso-entrada').innerText = data.pesagemEntrada ? data.pesagemEntrada.pesoKg : "0";
      if (document.getElementById('saida-conferente')) document.getElementById('saida-conferente').innerText = data.conferencia ? data.conferencia.conferente : "N/A";
      document.getElementById('painel-saida')?.classList.remove('hidden'); // Exibe o painel de saída
    }
  } catch (e) {
    alert("Erro ao consultar registro: " + e.message); // Trata qualquer exceção de banco de dados
  }
}

// ==========================================================================
// MÓDULO 3: PESAGEM E OPERAÇÕES DE PÁTIO
// ==========================================================================

// Grava o registro da pesagem inicial na balança de entrada
window.registrarPesoEntrada = async function() {
  const peso = parseFloat(document.getElementById('pesoEntrada').value); // Converte o valor numérico em decimal
  if(!peso || peso <= 0) return alert("Informe um peso válido"); // Valida se o peso é positivo

  try {
    const ref = doc(db, "operacoes", operacaoAtualId); // Referência do documento da OP ativa
    await updateDoc(ref, {
      pesagemEntrada: {
        pesoKg: peso, // Grava o valor do peso bruto de entrada em quilogramas
        dataHora: serverTimestamp(), // Data e hora oficial do servidor do Firebase
        operadorUid: auth.currentUser ? auth.currentUser.uid : "ANONIMO" // UID do operador da balança
      },
      status: "BALANCA_ENTRADA_REALIZADA" // Atualiza o status do processo
    });
    await registrarLog(operacaoAtualId, "PESAGEM_ENTRADA", `Peso registrado: ${peso}kg`); // Registra log de auditoria
    alert("Pesagem de Entrada Gravada!"); // Notifica usuário do sucesso
    window.location.reload(); // Recarrega a tela para a próxima operação
  } catch(e) { alert("Erro ao salvar: " + e.message); }
};

// Inicia o processo de carregamento ou descarga no setor de Doca
window.iniciarEtapaCarregamento = async function() {
  const tipo = document.getElementById('tipoOperacao').value; // Obtém o tipo de processo escolhido
  try {
    const ref = doc(db, "operacoes", operacaoAtualId); // Referência da OP
    await updateDoc(ref, {
      tipoOperacao: tipo, // Grava o tipo de movimentação de pátio
      status: tipo === "CARREGAMENTO" ? "EM_CARREGAMENTO" : "EM_DESCARGA", // Atualiza o status
      "conferencia.inicio": serverTimestamp() // Registra o carimbo do início da conferência
    });
    document.getElementById('fase-inicio').classList.add('hidden'); // Oculta a fase inicial
    document.getElementById('fase-fim').classList.remove('hidden'); // Exibe os campos de finalização de doca
  } catch(e) { alert("Erro: " + e.message); }
};

// Finaliza a etapa de conferência de doca
window.finalizarEtapaCarregamento = async function() {
  const conferente = document.getElementById('nomeConferente').value; // Nome do conferente responsável
  const obs = document.getElementById('observacoesConferencia').value; // Observações da carga
  if(!conferente) return alert("Informe o conferente"); // Exige preenchimento do conferente

  try {
    const ref = doc(db, "operacoes", operacaoAtualId); // Referência do documento no banco
    await updateDoc(ref, {
      "conferencia.fim": serverTimestamp(), // Registra a data/hora do término da conferência
      "conferencia.conferente": conferente, // Salva nome do conferente
      "conferencia.observacoes": obs, // Salva texto de observações e avarias
      status: "CARREGAMENTO_FINALIZADO" // Atualiza status no banco
    });
    alert("Etapa de Doca Finalizada!"); // Notifica a conclusão
    window.location.reload(); // Atualiza a página
  } catch(e) { alert("Erro ao finalizar: " + e.message); }
};

// Calcula em tempo real a diferença entre o peso de entrada e saída (Peso Líquido)
window.calcularLiquidoDinamico = function() {
  const pesoEnt = parseFloat(document.getElementById('saida-peso-entrada').innerText) || 0; // Pega o peso inicial
  const pesoSaida = parseFloat(document.getElementById('pesoSaida').value) || 0; // Pega o peso final digitado
  const liquido = Math.abs(pesoEnt - pesoSaida); // Calcula o valor absoluto da diferença entre ambos

  const display = document.getElementById('display-peso-liquido'); // Elemento span de exibição
  const btnFinalizar = document.getElementById('btn-finalizar-operacao'); // Botão de acionamento de saída
  const alertaVal = document.getElementById('alerta-validacao-peso'); // Bloco de mensagem de erro

  if (display) display.innerText = `${liquido.toFixed(2)} kg`; // Exibe o resultado líquido com 2 casas decimais

  if (pesoSaida <= pesoEnt && pesoEnt > 0) { // Validação de consistência do peso
    if (alertaVal) alertaVal.classList.remove('hidden'); // Exibe alerta se houver divergência de pesos
  } else {
    if (alertaVal) alertaVal.classList.add('hidden'); // Esconde alerta se estiver tudo correto
  }

  if (btnFinalizar) btnFinalizar.disabled = false; // Habilita o botão para finalização
};

// Processa o encerramento da operação e a pesagem de saída na balança final
window.processarSaida = async function() {
  const pesoSaida = parseFloat(document.getElementById('pesoSaida').value); // Captura peso digitado na saída
  const pesoEnt = parseFloat(document.getElementById('saida-peso-entrada').innerText) || 0; // Captura peso registrado na entrada
  const pesoLiquido = Math.abs(pesoEnt - pesoSaida); // Calcula a tara líquida movimentada

  try {
    const ref = doc(db, "operacoes", operacaoAtualId); // Referência do documento da OP ativa
    await updateDoc(ref, {
      pesagemSaida: {
        pesoKg: pesoSaida, // Salva peso de saída
        pesoLiquidoKg: pesoLiquido, // Salva o líquido processado
        dataHora: serverTimestamp(), // Data e hora do encerramento
        operadorUid: auth.currentUser ? auth.currentUser.uid : "ANONIMO" // UID do operador
      },
      status: "CONCLUIDO" // Marca a operação com status CONCLUIDO
    });
    await registrarLog(operacaoAtualId, "ENCERRAMENTO", `Operação Concluída. Peso Líq: ${pesoLiquido}kg`); // Grava o log
    alert("Operação Concluída com Sucesso!"); // Notifica encerramento bem sucedido
    window.location.reload(); // Recarrega a tela
  } catch(e) { alert("Erro no encerramento: " + e.message); }
};

// ==========================================================================
// MÓDULO 4: PAINEL ADMINISTRATIVO & AUDITORIA
// ==========================================================================

// Função que busca todo o histórico de operações cadastradas no Firestore e calcula as estatísticas
window.carregarHistoricoOperacoes = async function() {
  const tbody = document.getElementById('tbody-historico'); // Elemento onde as linhas da tabela serão injetadas
  if (!tbody) return; // Se a tabela não existir nesta página, interrompe a execução
  tbody.innerHTML = ""; // Limpa a tabela antes de preencher com novos dados

  let patioCount = 0; // Contador de caminhões no pátio
  let carregandoCount = 0; // Contador de veículos em processo de doca
  let finalizadosHojeCount = 0; // Contador de veículos finalizados no dia de hoje
  let pesoTotal = 0; // Acumulador de peso total movimentado

  const hojeStr = new Date().toDateString(); // Data de hoje em string para comparação

  try {
    const q = query(collection(db, "operacoes"), orderBy("auditoria.criadoEm", "desc")); // Consulta ordenada pelas OPs mais recentes
    const snapshot = await getDocs(q); // Executa a busca no Firestore

    snapshot.forEach((docSnap) => { // Laço para percorrer cada registro retornado
      const data = docSnap.data(); // Extrai os dados
      const status = data.status; // Obtém a situação da OP

      if (status === "ENTRADA_REGISTRADA" || status === "BALANCA_ENTRADA_REALIZADA") {
        patioCount++; // Incrementa contador do pátio
      } else if (status === "EM_CARREGAMENTO" || status === "EM_DESCARGA") {
        carregandoCount++; // Incrementa contador de doca
      }

      if (status === "CONCLUIDO") {
        const dataConclusao = data.pesagemSaida?.dataHora?.toDate();
        if (dataConclusao && dataConclusao.toDateString() === hojeStr) {
          finalizadosHojeCount++; // Incrementa concluídos hoje
        }
        if (data.pesagemSaida?.pesoLiquidoKg) {
          pesoTotal += Number(data.pesagemSaida.pesoLiquidoKg); // Soma ao peso total movimentado
        }
      }

      const nomeMot = typeof data.motorista === 'object' ? data.motorista.nome : (data.nomeMotorista || data.motorista); // Garante a extração correta do nome
      const tr = document.createElement('tr'); // Cria o elemento de linha da tabela
      tr.innerHTML = `
        <td>${data.numeroOperacao || '-'}</td>
        <td>${data.placa || '-'}</td>
        <td>${nomeMot || '-'}</td>
        <td>${data.auditoria?.criadoEm ? new Date(data.auditoria.criadoEm.toDate()).toLocaleString() : '-'}</td>
        <td>${data.pesagemEntrada ? data.pesagemEntrada.pesoKg + ' kg' : '-'}</td>
        <td>${data.pesagemSaida ? data.pesagemSaida.pesoKg + ' kg' : '-'}</td>
        <td>${data.pesagemSaida ? data.pesagemSaida.pesoLiquidoKg + ' kg' : '-'}</td>
        <td><span class="badge">${data.status}</span></td>
        <td><button class="btn btn-danger" onclick="cancelarOperacao('${docSnap.id}')">Cancelar</button></td>
      `; // Insere o código HTML formatado com os dados da operação
      tbody.appendChild(tr); // Injeta a linha criada no corpo da tabela
    });

    // Atualiza os valores estatísticos nos cartões do painel gerencial
    if (document.getElementById('stat-patio')) document.getElementById('stat-patio').innerText = patioCount;
    if (document.getElementById('stat-carregando')) document.getElementById('stat-carregando').innerText = carregandoCount;
    if (document.getElementById('stat-finalizados')) document.getElementById('stat-finalizados').innerText = finalizadosHojeCount;
    if (document.getElementById('stat-peso-total')) document.getElementById('stat-peso-total').innerText = `${pesoTotal.toFixed(2)} kg`;

  } catch(e) { 
    console.error("Erro ao carregar histórico:", e); // Exibe eventuais falhas de consulta no console
  }
};

// Executa o cancelamento administrativo de uma operação gravada
window.cancelarOperacao = async function(id) {
  const motivo = prompt("Motivo do cancelamento administrativo:"); // Abre janela para o usuário informar a razão do cancelamento
  if(!motivo) return; // Interrompe caso o motivo não seja informado

  try {
    await updateDoc(doc(db, "operacoes", id), {
      status: "CANCELADO", // Altera o status da operação para CANCELADO
      motivoCancelamento: motivo // Grava o motivo fornecido
    });
    await registrarLog(id, "CANCELAMENTO", `Motivo: ${motivo}`); // Registra log de auditoria
    alert("Operação Cancelada!"); // Exibe alerta confirmando o cancelamento
    carregarHistoricoOperacoes(); // Atualiza os dados exibidos na tabela do histórico
  } catch(e) { alert("Erro ao cancelar: " + e.message); }
};

// Grava registros de logs de auditoria de cada ação na coleção 'logs' no Firestore
async function registrarLog(opId, acao, detalhes) {
  try {
    await addDoc(collection(db, "logs"), {
      operacaoId: opId, // ID do documento afetado
      acao: acao, // Descrição da ação executada
      detalhes: detalhes, // Detalhes complementares
      timestamp: serverTimestamp(), // Data e hora do servidor
      usuarioUid: auth.currentUser ? auth.currentUser.uid : "SISTEMA" // Usuário executor da ação
    });
  } catch(e) { console.error("Erro ao gravar log", e); } // Log em console se houver erro
}

// Dispara a leitura inicial da tabela de operações se o elemento estiver presente na página
if(document.getElementById('tbody-historico')) {
  carregarHistoricoOperacoes(); // Carrega os dados na inicialização
}
// Importação do módulo de suporte inteligente
import { analisarPesagem, gerarResumoOperacional } from "./ai-assistant.js";