# Documentação das Coleções Firestore

Este documento descreve as coleções utilizadas no Firebase Firestore para o sistema de Gestão de Produção 3D, detalhando o propósito de cada coleção e a estrutura dos documentos que elas armazenam.

## Coleções Principais

### `insumos`
- **Propósito**: Armazena informações sobre todos os insumos (matérias-primas, tempo, materiais diversos) utilizados na produção.
- **Estrutura do Documento (Interface `Insumo`)**:
    - `id`: string (ID único do insumo)
    - `nome`: string (Nome do insumo)
    - `tipo`: string (Ex: 'filamento', 'tempo', 'material', 'outros')
    - `unidade`: string (Unidade de medida, ex: 'kg', 'horas', 'unidades')
    - `custoPorUnidade`: number (Custo unitário do insumo)
    - `posicoesEstoque`: `PosicaoEstoque[]` (Array de objetos que indicam onde o insumo está armazenado e em que quantidade)
    - `estoqueMinimo`: number (Quantidade mínima em estoque para alerta)
    - `cor`: string (Para filamentos)
    - `especificacoes`: object (Detalhes específicos por tipo de insumo, ex: `fabricante`, `tipoFilamento`, `pesoBruto`, `valorHora`, `tipoEmbalagem`, etc.)
    - `grupoFilamentoId`: string (Referência ao ID do grupo de filamento, se aplicável)
    - `estoqueTotal`: number (Quantidade total em estoque, calculada)
    - `status`: 'aberto' | 'fechado' (Para spools de filamento)
    - `dataAbertura`: Timestamp (Data de abertura do spool)
    - `consumoProducao`: number (Consumo registrado em produção)

### `pecas`
- **Propósito**: Armazena informações sobre as peças individuais que compõem os modelos.
- **Estrutura do Documento (Interface `Peca`)**:
    - `id`: string
    - `sku`: string
    - `nome`: string
    - `isComposta`: boolean (Indica se a peça é composta por outras partes)
    - `gruposImpressao`: `GrupoImpressao[]` (Detalhes dos grupos de impressão necessários para produzir a peça)
    - `tempoMontagem`: number (Tempo de montagem adicional para a peça)
    - `custoCalculado`: number
    - `precoSugerido`: number
    - `posicoesEstoque`: `PosicaoEstoque[]`
    - `estoqueTotal`: number
    - `hasAssembly`: boolean (Indica se a peça requer montagem)

### `modelos`
- **Propósito**: Armazena informações sobre os modelos de produtos, que são compostos por peças.
- **Estrutura do Documento (Interface `Modelo`)**:
    - `id`: string
    - `sku`: string
    - `nome`: string
    - `pecas`: `{ pecaId: string; quantidade: number; }[]` (Lista de peças e suas quantidades que compõem o modelo)
    - `tempoMontagem`: number
    - `custoCalculado`: number
    - `precoSugerido`: number
    - `posicoesEstoque`: `PosicaoEstoque[]`
    - `estoqueTotal`: number

### `kits`
- **Propósito**: Armazena informações sobre os kits de produtos, que são compostos por modelos.
- **Estrutura do Documento (Interface `Kit`)**:
    - `id`: string
    - `sku`: string
    - `nome`: string
    - `modelos`: `{ modeloId: string; quantidade: number; }[]` (Lista de modelos e suas quantidades que compõem o kit)
    - `tempoMontagem`: number
    - `custoCalculado`: number
    - `precoSugerido`: number
    - `posicoesEstoque`: `PosicaoEstoque[]`
    - `estoqueTotal`: number

### `partes`
- **Propósito**: Armazena informações sobre as partes individuais que podem compor peças compostas.
- **Estrutura do Documento (Interface `Parte`)**:
    - `id`: string
    - `sku`: string
    - `nome`: string
    - `posicoesEstoque`: `PosicaoEstoque[]`
    - `identificador`: string
    - `hasAssembly`: boolean
    - `estoqueTotal`: number

### `pedidos`
- **Propósito**: Armazena os detalhes dos pedidos de clientes.
- **Estrutura do Documento (Interface `Pedido`)**:
    - `id`: string
    - `numero`: string
    - `comprador`: string
    - `produtos`: `{ tipo: 'kit' | 'modelo' | 'peca'; produtoId: string; quantidade: number; }[]` (Produtos incluídos no pedido)
    - `status`: 'aguardando' | 'em_producao' | 'concluido'
    - `etapas`: object (Status de cada etapa da produção: impressão, montagem, embalagem, faturamento, envio)
    - `custos`: object (Custos de insumos, tempo e total)
    - `tempos`: object (Tempos de impressão, montagem e total)
    - `dataCriacao`: Date
    - `dataPrevisao`: Date
    - `dataConclusao`: Date (Opcional)
    - `productionGroups`: `ProductionGroup[]` (Grupos de produção associados ao pedido)

### `settings`
- **Propósito**: Armazena configurações globais do sistema.
- **Estrutura do Documento (Interface `Configuracoes`)**:
    - `margemLucro`: number
    - `valorHoraTrabaho`: number
    - `alertasEmail`: boolean
    - `configuracoesPDF`: object

### `gruposDeFilamento`
- **Propósito**: Agrupa filamentos por tipo, cor e fabricante para gerenciamento de estoque e custo ponderado.
- **Estrutura do Documento (Interface `GrupoDeFilamento`)**:
    - `id`: string
    - `nome`: string (Ex: "3D Prime PLA Verde")
    - `fabricante`: string
    - `material`: string
    - `cor`: string
    - `custoMedioPonderado`: number (Custo por grama)
    - `estoqueTotalGramas`: number
    - `spoolsEmEstoqueIds`: string[] (IDs dos insumos/spools que pertencem a este grupo)
    - `updatedAt`: Timestamp
    - `consumoProducao`: number

### `modelosRecipiente`
- **Propósito**: Define modelos de recipientes de armazenamento (bandejas, caixas, potes) com suas dimensões e divisões.
- **Estrutura do Documento (Interface `ModeloRecipiente`)**:
    - `id`: string (Opcional)
    - `nome`: string
    - `tipo`: 'bandeja' | 'caixa' | 'pote' | 'outro'
    - `dimensoes`: `{ x: number; y: number; z: number; }`
    - `divisoes`: `{ horizontais: number; verticais: number; }` (Opcional)
    - `createdAt`: Date (Opcional)
    - `updatedAt`: Date (Opcional)

### `recipientes`
- **Propósito**: Armazena instâncias de recipientes de armazenamento baseados nos `modelosRecipiente`, com suas localizações físicas e conteúdo.
- **Estrutura do Documento (Inferida)**:
    - `id`: string (ID único do recipiente)
    - `modeloRecipienteId`: string (Referência ao ID de um documento em `modelosRecipiente`)
    - `nome`: string (Nome ou identificador do recipiente)
    - `localId`: string (Referência ao ID do local de estoque onde o recipiente está)
    - `posicaoNaGrade`: `{ x: number; y: number; z: number; }` (Posição do recipiente dentro de um local de estoque 3D)
    - `conteudo`: `PosicaoEstoque[]` (Lista de itens armazenados neste recipiente, com suas quantidades e divisões internas)
    - `createdAt`: Timestamp
    - `updatedAt`: Timestamp

### `lancamentosEstoque`
- **Propósito**: Registra todas as movimentações de estoque de produtos (partes, peças, modelos, kits).
- **Estrutura do Documento (Interface `LancamentoProduto`)**:
    - `id`: string
    - `tipoProduto`: 'partes' | 'pecas' | 'modelos' | 'kits'
    - `produtoId`: string
    - `tipoMovimento`: 'entrada' | 'saida' | 'ajuste'
    - `usuario`: string
    - `observacao`: string (Opcional)
    - `data`: Timestamp
    - `locais`: `{ recipienteId?: string; divisao?: { h: number; v: number }; quantidade: number; localId?: string; }[]` (Detalhes dos locais afetados pela movimentação)

### `lancamentosInsumos`
- **Propósito**: Registra todas as movimentações de estoque de insumos.
- **Estrutura do Documento (Interface `LancamentoInsumo`)**:
    - `id`: string
    - `insumoId`: string
    - `tipoInsumo`: 'filamento' | 'tempo' | 'material' | 'outros';
    - `tipoMovimento`: 'entrada' | 'saida' | 'ajuste'
    - `quantidade`: number
    - `unidadeMedida`: string (Opcional)
    - `data`: Timestamp (Opcional)
    - `origem`: string (Opcional)
    - `detalhes`: string (Opcional)
    - `locais`: `PosicaoEstoque[]` (Opcional)

### `locaisProdutos`
- **Propósito**: Armazena informações sobre os locais físicos de estoque onde produtos são armazenados.
- **Estrutura do Documento (Inferida)**:
    - `id`: string (ID único do local)
    - `nome`: string (Nome do local, ex: "Prateleira A", "Armário 1")
    - `tipo`: string (Ex: "prateleira", "armario", "caixa grande")
    - `capacidade`: number (Capacidade total do local, se aplicável)
    - `dimensoes`: `{ x: number; y: number; z: number; }` (Dimensões do local, se aplicável)
    - `posicoes`: `{ x: number; y: number; z: number; }[]` (Lista de posições 3D disponíveis dentro do local)
    - `createdAt`: Timestamp
    - `updatedAt`: Timestamp

### `locaisInsumos`
- **Propósito**: Armazena informações sobre os locais físicos de estoque onde insumos são armazenados.
- **Estrutura do Documento (Inferida - similar a `locaisProdutos`)**:
    - `id`: string (ID único do local)
    - `nome`: string (Nome do local, ex: "Gaveta Filamentos", "Armário Insumos")
    - `tipo`: string
    - `capacidade`: number
    - `dimensoes`: `{ x: number; y: number; z: number; }`
    - `posicoes`: `{ x: number; y: number; z: number; }[]`
    - `createdAt`: Timestamp
    - `updatedAt`: Timestamp

### `produtos`
- **Propósito**: Esta coleção não parece ser uma coleção de documentos persistente no Firestore, mas sim um tipo genérico (`Produto` interface) usado para representar diferentes tipos de itens (partes, peças, modelos, kits, insumos) em contextos onde a distinção específica não é necessária, como em listagens de estoque consolidadas.
- **Estrutura do Documento (Interface `Produto` - Usada para representação, não para armazenamento direto)**:
    - `id`: string
    - `nome`: string
    - `sku`: string
    - `posicoesEstoque`: `PosicaoEstoque[]`
    - `recipienteId`: string (Pode ser depreciado)
    - `tipoProduto`: 'parte' | 'peca' | 'modelo' | 'kit' | 'insumo'
    - `estoqueTotal`: number (Propriedade calculada)

### `historico`
- **Propósito**: Registra o histórico de ações e modificações no sistema.
- **Estrutura do Documento (Interface `Historico`)**:
    - `id`: string
    - `tipo`: 'pedido' | 'produto' | 'insumo' | 'estoque'
    - `objetoId`: string (ID do objeto que foi modificado)
    - `acao`: 'criado' | 'editado' | 'excluido'
    - `dadosAnteriores`: `Record<string, any>` (Opcional)
    - `dadosNovos`: `Record<string, any>` (Opcional)
    - `timestamp`: Date
    - `usuario`: string
