# CSV Import Format Guide

## Supported Formats

### Chase Credit Card
- **Export from**: chase.com → Statements & Documents → Download activity
- **Format**: CSV
- **Columns**: `Transaction Date, Post Date, Description, Category, Type, Amount`
- **Notes**: Amounts are negative for purchases, positive for payments/credits

### Apple Card
- **Export from**: Wallet app → Apple Card → Card Balance → Total Activity → Export Transactions
- **Format**: CSV
- **Columns**: `Transaction Date, Clearing Date, Description, Merchant, Category, Type, Amount (USD)`
- **Notes**: Purchases are positive amounts

### Generic CSV
- **Required columns**: Date, Description/Merchant, Amount
- **Optional columns**: Category, Type, Card
- **Auto-detection**: The parser attempts to match known formats first, falls back to generic

## Adding New Card Parsers

1. Create a new parser in `src/features/csv-import/parsers/`
2. Implement the `CSVParser` interface from `src/core/types/`
3. Add detection logic (header row matching)
4. Register in the parser factory
5. Add unit tests with sample data
