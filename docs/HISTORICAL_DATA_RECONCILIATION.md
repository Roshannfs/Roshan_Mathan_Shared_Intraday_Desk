# Historical data reconciliation and migration notes

These are the values read from `Roshan_Mathan_Trading_Tracker_Date_Enabled(1).xlsx` and the October 19, 2026 INDmoney screenshots provided in the chat. Imported values remain editable through follow-up data corrections; verify all numbers against the broker's official statement before using them for money settlement.

## Completed historical trades from the uploaded Excel tracker

| Date | Instrument | Qty | Buy value | Sell value | Gross P&L | Brokerage | Other charges | Net P&L | Roshan recorded net | Mathan recorded net |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2026-10-14 | SS Retail | 33 | ₹25,442.20 | ₹25,964.40 | ₹522.20 | ₹40.00 | ₹16.56 | ₹465.64 | ₹448.34 | ₹17.30 |
| 2026-10-15 | NETWEB | 9 | ₹43,487.80 | ₹42,435.90 | −₹1,051.90 | ₹40.00 | ₹22.66 | −₹1,114.56 | −₹698.18 | −₹416.38 |
| 2026-10-16 | Cupid | 100 | ₹35,070.00 | ₹35,455.00 | ₹385.00 | ₹40.00 | ₹19.99 | ₹325.01 | ₹201.93 | ₹123.08 |
| 2026-10-16 | Euro Pratik Sales | 17 | ₹3,070.88 | ₹3,106.58 | ₹35.70 | ₹6.18 | ₹2.21 | ₹27.31 | ₹0.00 | ₹27.31 |
| **Total** | | | | | **−₹109.00** | | **₹187.60** | **−₹296.60** | **−₹47.91** | **−₹248.69** |

## October 19, 2026 positions from INDmoney screenshots

| Batch | Instrument | Qty | Buy value | Sell value | Gross P&L | Brokerage | Other charges | Net P&L status |
|---|---|---:|---:|---:|---:|---:|---:|---|
| Batch 1 | Gabriel India | 10 | ₹14,979.00 | ₹15,132.00 | +₹153.00 | ₹30.10 | ₹10.71 | Confirmed +₹112.19 |
| Batch 1 | Union Bank of India | 85 | ₹15,094.30 | ₹15,061.15 | −₹33.15 | ₹30.15 | ₹10.71 | Confirmed −₹74.01 |
| Batch 1 | Tata Consultancy Services (TCS) | 10 | ₹24,939.00 | ₹24,600.00 | −₹339.00 | **Pending exact amount** | **Pending exact amount** | **Needs review** |
| Batch 2 | Union Bank of India (auto squared off) | 285 | ₹51,280.30 | ₹51,093.15 | −₹187.15 | ₹70.15 | ₹89.63 | Confirmed −₹346.93 |

The exact TCS charge amount was not visible in the supplied TCS screenshot crop and no exact figure was written in the messages. The app intentionally does not apply a guessed value. Use the app's **Enter verified charges** action to input the brokerage and government/other charges from the actual INDmoney detail.

## Carry-forward balance logic

- Carry-forward before the recorded Mathan withdrawal: Roshan ₹4,952.09; Mathan ₹3,667.21.
- Mathan withdrawal adjustment: −₹340.13.
- Starting owner balances for new-trade P&L accounting: Roshan ₹4,952.09; Mathan ₹3,327.08; combined ₹8,279.17.
- The four completed historical trades remain visible in lifetime analytics but do not alter these carry-forward balances a second time.
- The current-day Batch 1 split percentage is based on the opening ownership proportions (Roshan 59.813846%, Mathan 40.186154%). Batch 2 uses the same percentage to six decimals because splitting a P&L by the same ownership proportions preserves the ratio. Each trade's stored allocations and rounding are auditable.

The carry-forward ownership ledger is not the same thing as INDmoney buying power or intraday margin. Compare the balance against the actual wallet/capital report and account for any unsettled/pending credit separately.
