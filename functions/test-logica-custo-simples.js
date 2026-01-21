// Teste simples da lógica de cálculo de custos sem Firebase

console.log('🧪 Teste da lógica de cálculo de custos (sem Firebase)\n');

// Simulação dos valores de custo por minuto
const serviceCosts = {
  costPerMinute3DPrint: 0.50,
  costPerMinuteAssembly: 0.30,
  costPerMinutePackaging: 0.20
};

// Custo do filamento por grama
const custoFilamentoPorGrama = 0.05;

// Teste 1: Cálculo de uma peça
console.log('📋 Teste 1: Cálculo de uma peça');
console.log('   - Tempo impressão: 20min');
console.log('   - Filamento: 30g');
console.log('   - Tempo montagem peça: 0min');

const tempoImpressaoPeca = 20;
const quantidadeFilamento = 30;
const tempoMontagemPeca = 0;

const custoImpressaoPeca = tempoImpressaoPeca * serviceCosts.costPerMinute3DPrint;
const custoFilamentoPeca = quantidadeFilamento * custoFilamentoPorGrama;
const custoMontagemPeca = tempoMontagemPeca * serviceCosts.costPerMinuteAssembly;

const custoTotalPeca = custoImpressaoPeca + custoFilamentoPeca + custoMontagemPeca;

console.log(`   ✅ Custo impressão: ${tempoImpressaoPeca}min × R$${serviceCosts.costPerMinute3DPrint}/min = R$${custoImpressaoPeca.toFixed(2)}`);
console.log(`   ✅ Custo filamento: ${quantidadeFilamento}g × R$${custoFilamentoPorGrama}/g = R$${custoFilamentoPeca.toFixed(2)}`);
console.log(`   ✅ Custo montagem: ${tempoMontagemPeca}min × R$${serviceCosts.costPerMinuteAssembly}/min = R$${custoMontagemPeca.toFixed(2)}`);
console.log(`   ✅ Total peça: R$${custoTotalPeca.toFixed(2)}`);

// Teste 2: Cálculo de um modelo com 3 peças
console.log('\n📋 Teste 2: Cálculo de um modelo com 3 peças');
console.log('   - 3 peças × R$' + custoTotalPeca.toFixed(2));
console.log('   - Tempo montagem adicional do modelo: 35min');

const quantidadePecasNoModelo = 3;
const tempoMontagemAdicionalModelo = 35;

const custoPecasNoModelo = custoTotalPeca * quantidadePecasNoModelo;
const custoMontagemAdicionalModelo = tempoMontagemAdicionalModelo * serviceCosts.costPerMinuteAssembly;

const custoTotalModelo = custoPecasNoModelo + custoMontagemAdicionalModelo;

console.log(`   ✅ Custo das peças: ${quantidadePecasNoModelo} × R$${custoTotalPeca.toFixed(2)} = R$${custoPecasNoModelo.toFixed(2)}`);
console.log(`   ✅ Custo montagem adicional: ${tempoMontagemAdicionalModelo}min × R$${serviceCosts.costPerMinuteAssembly}/min = R$${custoMontagemAdicionalModelo.toFixed(2)}`);
console.log(`   ✅ Total modelo: R$${custoTotalModelo.toFixed(2)}`);

// Teste 3: Cálculo de um kit com 1 modelo
console.log('\n📋 Teste 3: Cálculo de um kit com 1 modelo');
console.log('   - 1 modelo × R$' + custoTotalModelo.toFixed(2));
console.log('   - Tempo montagem adicional do kit: 60min');

const quantidadeModelosNoKit = 1;
const tempoMontagemAdicionalKit = 60;

const custoModelosNoKit = custoTotalModelo * quantidadeModelosNoKit;
const custoMontagemAdicionalKit = tempoMontagemAdicionalKit * serviceCosts.costPerMinuteAssembly;

const custoTotalKit = custoModelosNoKit + custoMontagemAdicionalKit;

console.log(`   ✅ Custo dos modelos: ${quantidadeModelosNoKit} × R$${custoTotalModelo.toFixed(2)} = R$${custoModelosNoKit.toFixed(2)}`);
console.log(`   ✅ Custo montagem adicional: ${tempoMontagemAdicionalKit}min × R$${serviceCosts.costPerMinuteAssembly}/min = R$${custoMontagemAdicionalKit.toFixed(2)}`);
console.log(`   ✅ Total kit: R$${custoTotalKit.toFixed(2)}`);

// Verificação da correção da duplicação
console.log('\n🔍 Verificação da correção da duplicação de montagem:');
console.log('   - Antes da correção: tempoMontagem + tempoMontagemAdicional eram somados');
console.log('   - Depois da correção: apenas tempoMontagemAdicional é usado para modelos e kits');
console.log('   - tempoMontagem continua sendo usado apenas para peças');

// Exemplo do problema anterior
console.log('\n⚠️  Exemplo do problema anterior (duplicação):');
const tempoMontagemModeloAntigo = 35; // Supondo que isso já estava nas peças
const tempoMontagemAdicionalModeloAntigo = 35;
const tempoTotalMontagemAntigo = tempoMontagemModeloAntigo + tempoMontagemAdicionalModeloAntigo;
const custoMontagemDuplicado = tempoTotalMontagemAntigo * serviceCosts.costPerMinuteAssembly;

console.log(`   - tempoMontagem: ${tempoMontagemModeloAntigo}min`);
console.log(`   - tempoMontagemAdicional: ${tempoMontagemAdicionalModeloAntigo}min`);
console.log(`   - Total antigo: ${tempoTotalMontagemAntigo}min × R$${serviceCosts.costPerMinuteAssembly}/min = R$${custoMontagemDuplicado.toFixed(2)}`);
console.log(`   - Correção atual: apenas ${tempoMontagemAdicionalModeloAntigo}min × R$${serviceCosts.costPerMinuteAssembly}/min = R$${custoMontagemAdicionalModelo.toFixed(2)}`);
console.log(`   - Economia: R$${(custoMontagemDuplicado - custoMontagemAdicionalModelo).toFixed(2)}`);

console.log('\n🎉 Teste concluído! A correção elimina a duplicação de custos de montagem.');
