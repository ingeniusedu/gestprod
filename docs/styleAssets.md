# Style Assets - Iconography

This document outlines the standardized icons used across the application, ensuring consistency in the user interface.

## Product Type Icons

These icons are used to represent different product types in various parts of the application, such as modals and navigation tabs.

| Product Type | Icon Name | Usage Example (Component) | Notes |
|--------------|-----------|---------------------------|-------|
| Kit          | `Gift`    | `PedidoFormModal.jsx` (product type), `estoque/page.jsx` (tab) | Represents a collection of models. |
| Modelo       | `Box`     | `PedidoFormModal.jsx` (product type), `estoque/page.jsx` (tab) | Represents a 3D model or a product composed of parts. |
| Peça         | `Puzzle`  | `PedidoFormModal.jsx` (product type), `estoque/page.jsx` (tab) | Represents an individual part of a model. |
| Insumo       | `Layers`  | `estoque/page.jsx` (tab) | Represents raw materials or time. |
| Parte        | `Layers`  | `estoque/page.jsx` (tab) | Represents a component that can form a part. |

## General Icons

These icons are used for common actions and status indicators.

| Icon Name | Usage Example | Notes |
|-----------|---------------|-------|
| `Plus`    | Adding items  | Used for incrementing quantities or adding new entries. |
| `Minus`   | Decrementing items | Used for decrementing quantities. |
| `X`       | Removing items | Used for closing modals or removing items. |
| `Search`  | Search input  | Used in search bars. |
| `Filter`  | Filtering options | Used for filter controls. |
| `Edit`    | Editing an item | Used for initiating edit actions. |
| `Trash2`  | Deleting an item | Used for delete actions. |

## Stock Specific Icons

Icons used specifically within the stock management features.

| Icon Name | Usage Example | Notes |
|-----------|---------------|-------|
| `Spool`   | Filament summary | Represents a spool of filament, color is applied dynamically. |
| `PackageX`| Filament summary | Indicates no closed spool available for reservation. |
| `Weight`  | Filament summary | Indicates low filament weight. |
| `AlertTriangle` | Stock alerts | Indicates low stock levels for items other than filament. |
| `TrendingUp` | Stock status | Indicates adequate stock levels or upward trends. |
| `TrendingDown` | Stock status | Indicates low stock levels or downward trends. |
| `Upload`  | Import/Launch | Used for importing data or launching stock entries. |
| `ChevronDown` | Expandable rows | Used to indicate expandable sections in tables. |
| `ChevronUp` | Collapsed rows | Used to indicate collapsible sections in tables. |
