# Nova Estrutura de Gestão de Serviços

## Overview

Este documento descreve a nova estrutura implementada para gestão de serviços de impressão 3D, montagem e embalagem no sistema GestProd.

## Estrutura Antiga vs Nova

### Antiga
- `servicoId`: 'impressao_3d' | 'embalagem'
- `quantidade`: número (horas)
- Dados limitados e inflexíveis

### Nova
- `serviceType`: 'impressao_3d' | 'montagem' | 'embalagem'
- `origem`: 'pedido' | 'producao' | 'prototipagem' | 'pessoal' | 'outro'
- `payload`: objeto específico para cada tipo de serviço
- Dados flexíveis e extensíveis

## Coleções Firestore

### 1. `lancamentosServicos` (Entrada)
Documentos individuais lançados pelo frontend:

```typescript
interface LancamentoServico {
  serviceType: "impressao_3d" | "montagem" | "embalagem";
  origem: "pedido" | "producao" | "prototipagem" | "pessoal" | "outro";
  usuario: string;
  data: Timestamp;
  payload: Impressao3DPayload | MontagemPayload | EmbalagemPayload;
}
```

#### Payloads Específicos

**Impressão 3D:**
```typescript
interface Impressao3DPayload {
  impressora?: string;
  total: number; // tempo em minutos
  pedidoId?: string;
  optimizedGroupId?: string;
}
```

**Montagem:**
```typescript
interface MontagemPayload {
  tipo: 'peça' | 'modelo' | 'kit';
  total: number; // tempo em minutos
  pedidoId?: string;
  assemblyGroup?: string;
  productId?: string;
}
```

**Embalagem:**
```typescript
interface EmbalagemPayload {
  total: number; // tempo em minutos
  pedidoId?: string;
  assemblyGroup?: string;
}
```

### 2. `servicos` (Agregação Mensal)
Documentos mensais criados automaticamente pela função:

```typescript
interface ServicoMensal {
  serviceType: "impressao_3d" | "montagem" | "embalagem";
  mes_ano: string; // formato: "novembro_2025"
  total: number; // soma de todos os totais (minutos)
  custo_total: number; // soma de todos os custos
  eventos: ServicoEvento[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface ServicoEvento {
  id: string;
  origem: "pedido" | "producao" | "prototipagem" | "pessoal" | "outro";
  pedidoId?: string;
  optimizedGroupId?: string;
  assemblyGroup?: string;
  total: number; // tempo em minutos
  custo: number; // valor monetário
  data: Timestamp;
  usuario: string;
  payload: Impressao3DPayload | MontagemPayload | EmbalagemPayload;
}
```

### 3. `settings` (Configurações)
Documento de configuração de custos:

```typescript
// Document ID: custosServicos
{
  custoPorMinutoImpressao: number,  // ex: 0.50
  custoPorMinutoMontagem: number,     // ex: 0.30
  custoPorMinutoEmbalagem: number      // ex: 0.20
}
```

## IDs dos Documentos Mensais

Os documentos na coleção `servicos` usam o padrão:
`{serviceType}_{mesAno}`

Exemplos:
- `impressao_3d_novembro_2025`
- `montagem_novembro_2025`
- `embalagem_novembro_2025`

## Fluxo de Processamento

1. **Frontend** cria documento em `lancamentosServicos`
2. **Cloud Function** `processarLancamentoServico` é acionada
3. **Função**:
   - Identifica o tipo de serviço
   - Busca custo por minuto em `settings/custosServicos`
   - Calcula custo total (tempo × custo por minuto)
   - Cria/atualiza documento mensal em `servicos`
   - Adiciona evento ao array de eventos

## Exemplos de Uso

### Lançamento de Impressão 3D
```javascript
{
  serviceType: 'impressao_3d',
  origem: 'pedido',
  usuario: 'joao.silva',
  data: new Date(),
  payload: {
    impressora: 'Ender-3',
    total: 120, // 2 horas
    pedidoId: 'pedido_123',
    optimizedGroupId: 'grupo_456'
  }
}
```

### Lançamento de Montagem
```javascript
{
  serviceType: 'montagem',
  origem: 'producao',
  usuario: 'maria.santos',
  data: new Date(),
  payload: {
    tipo: 'modelo',
    total: 45, // 45 minutos
    assemblyGroup: 'assembly_789'
  }
}
```

### Lançamento de Embalagem
```javascript
{
  serviceType: 'embalagem',
  origem: 'pedido',
  usuario: 'pedro. Costa',
  data: new Date(),
  payload: {
    total: 30, // 30 minutos
    pedidoId: 'pedido_123',
    assemblyGroup: 'assembly_789'
  }
}
```

## Migração

### Código Antigo
```javascript
{
  servicoId: 'impressao_3d',
  quantidade: 2, // horas
  optimizedGroupId: 'grupo_456',
  pedidoId: 'pedido_123',
  usuario: 'joao.silva',
  data: new Date()
}
```

### Código Novo
```javascript
{
  serviceType: 'impressao_3d',
  origem: 'pedido',
  usuario: 'joao.silva',
  data: new Date(),
  payload: {
    total: 120, // minutos (2 horas × 60)
    pedidoId: 'pedido_123',
    optimizedGroupId: 'grupo_456'
  }
}
```

## Vantagens da Nova Estrutura

1. **Flexibilidade**: Payloads específicos para cada tipo de serviço
2. **Rastreabilidade**: Dados detalhados de origem e contexto
3. **Agregação Automática**: Cálculos mensais automáticos
4. **Extensibilidade**: Fácil adicionar novos tipos de serviços
5. **Histórico Completo**: Array de eventos com todos os detalhes

## Testes

Para testar a nova estrutura:

```bash
cd backend/functions
node test-servicos.js
```

O script cria:
- Configurações de custos (se não existirem)
- Lançamentos de teste
- Verifica a criação dos documentos mensais
- Testa acumulação de múltiplos lançamentos

## Arquivos Alterados

### Backend (Functions)
- `functions/src/types/productionTypes.ts` - Novos tipos
- `functions/src/utils/lancamentoServicoUtils.ts` - Nova lógica
- `functions/src/index.ts` - Updated function name

### Frontend
- `src/app/types/index.ts` - Novos tipos
- `src/app/hooks/useProductionActions.ts` - Updated lançamentos
- `src/app/producao/utils/packagingUtilsV2.ts` - Updated helpers

## Considerações

1. **Backward Compatibility**: A função antiga continua funcionando para lançamentos existentes
2. **Performance**: Uso de transações para garantir consistência
3. **Logging**: Logs detalhados para debugging
4. **Error Handling**: Tratamento robusto de erros e validações
