// ==========================================================================
// MÓDULO ASSISTENTE IA - TRANSPORTADORA PROCHA
// ==========================================================================

/**
 * Analisa divergências de pesagem na balança de saída
 * @param {number} pesoEntrada - Peso inicial (kg)
 * @param {number} pesoSaida - Peso final (kg)
 * @returns {object} Análise de risco/alerta
 */
export function analisarPesagem(pesoEntrada, pesoSaida) {
  const liquido = Math.abs(pesoEntrada - pesoSaida);
  let alerta = null;

  if (pesoSaida <= pesoEntrada && pesoEntrada > 0) {
    alerta = "ATENÇÃO: O peso de saída é inferior ou igual ao de entrada para operação de carregamento. Verifique se o veículo foi descarregado ou se há falha na pesagem.";
  }

  return {
    pesoLiquido: liquido,
    alerta: alerta,
    statusValido: !alerta
  };
}

/**
 * Resume estatísticas do pátio para o painel gerencial
 * @param {Array} operacoes - Lista de operações do Firestore
 */
export function gerarResumoOperacional(operacoes) {
  const resumo = {
    totalPatio: 0,
    emCarregamento: 0,
    concluidosHoje: 0,
    pesoTotalKg: 0
  };

  const hoje = new Date().toDateString();

  operacoes.forEach(op => {
    if (op.status === "ENTRADA_REGISTRADA" || op.status === "BALANCA_ENTRADA_REALIZADA") {
      resumo.totalPatio++;
    } else if (op.status === "EM_CARREGAMENTO" || op.status === "EM_DESCARGA") {
      resumo.emCarregamento++;
    }

    if (op.status === "CONCLUIDO") {
      const dataFim = op.pesagemSaida?.dataHora?.toDate()?.toDateString();
      if (dataFim === hoje) resumo.concluidosHoje++;
      if (op.pesagemSaida?.pesoLiquidoKg) resumo.pesoTotalKg += Number(op.pesagemSaida.pesoLiquidoKg);
    }
  });

  return resumo;
}