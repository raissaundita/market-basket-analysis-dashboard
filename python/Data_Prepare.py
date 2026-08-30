"""
MARKET BASKET ANALYSIS - Order Data
====================================
Script ini melakukan analisis pola pembelian (Market Basket Analysis)
menggunakan algoritma Apriori, lalu menghasilkan 2 file CSV:
1. rules.csv  -> hasil association rules (untuk chart & tabel rules di dashboard)
2. orders.csv -> data transaksi yang sudah dirapikan (untuk KPI & chart lain di dashboard)

Level analisis: SUB-CATEGORY (bukan nama produk lengkap), karena nama produk
terlalu banyak variasinya (1850 produk unik) sehingga polanya jadi terlalu jarang
muncul. Sub-Category (17 kategori) memberi pola yang lebih bermakna.
"""

import pandas as pd
from mlxtend.frequent_patterns import apriori, association_rules
from mlxtend.preprocessing import TransactionEncoder

# STEP 1: Baca data mentah
df = pd.read_csv(""D:/IBM Bob/Capstone Project/python/raw_order_data.csv"")

# Angka di kolom Sales, Discount, Profit masih pakai koma sebagai desimal ubah jd titik
for kolom in ["Sales", "Discount", "Profit"]:
    df[kolom] = df[kolom].astype(str).str.replace(",", ".").astype(float)

print(f"Total baris data: {len(df)}")
print(f"Total transaksi (Order ID unik): {df['Order ID'].nunique()}")

# STEP 2: Bentuk data transaksi (1 Order ID = 1 keranjang belanja / basket)
# Kelompokkan Sub-Category per Order ID -> jadi list of list
# Contoh: Order 'CA-2016-152156' -> ['Bookcases', 'Chairs']
basket = (
    df.groupby("Order ID")["Sub-Category"]
    .apply(lambda x: list(set(x)))  # set() untuk hilangkan duplikat dalam 1 order
    .tolist()
)

# STEP 3: Ubah jadi format tabel biner (one-hot encoding)
# TransactionEncoder mengubah setiap basket jadi baris tabel dengan
# kolom = semua sub-category, isinya True/False (dibeli atau tidak)
te = TransactionEncoder()
te_array = te.fit(basket).transform(basket)
basket_df = pd.DataFrame(te_array, columns=te.columns_)

# STEP 4: Cari frequent itemsets (kombinasi produk yang sering muncul bareng)
# min_support = 0.01 artinya kombinasi itu minimal muncul di 1% dari semua transaksi
frequent_itemsets = apriori(basket_df, min_support=0.01, use_colnames=True)
print(f"\nJumlah frequent itemsets ditemukan: {len(frequent_itemsets)}")

# STEP 5: Buat association rules dari frequent itemsets
# Rules berbentuk: "kalau beli A (antecedent) -> kemungkinan juga beli B (consequent)"
# min_threshold pada confidence = 0.1 (10%) supaya tidak terlalu banyak rules yang lemah
rules = association_rules(frequent_itemsets, metric="confidence", min_threshold=0.1)

# Urutkan rules dari yang paling kuat (Lift tertinggi)
rules = rules.sort_values("lift", ascending=False)

print(f"Jumlah rules ditemukan: {len(rules)}")

# STEP 6: Rapikan rules.csv supaya siap dipakai dashboard
# frozenset (isi antecedent/consequent) diubah jadi teks biasa, dipisah koma
rules_clean = pd.DataFrame({
    "Antecedent": rules["antecedents"].apply(lambda x: ", ".join(sorted(x))),
    "Consequent": rules["consequents"].apply(lambda x: ", ".join(sorted(x))),
    "Support": rules["support"].round(4),
    "Confidence": rules["confidence"].round(4),
    "Lift": rules["lift"].round(4),
})

rules_clean.to_csv("D:/IBM Bob/Capstone Project/data/rules.csv", index=False)
print("\nrules.csv berhasil dibuat. Contoh 5 rules teratas:")
print(rules_clean.head())

# STEP 7: Siapkan orders.csv (data transaksi yang sudah dirapikan)
# Ini untuk KPI card & chart lain di dashboard (bukan untuk rules)
orders_clean = df[[
    "Order ID", "Order Date", "Region", "State", "City",
    "Category", "Sub-Category", "Product Name",
    "Sales", "Quantity", "Discount", "Profit", "Segment"
]].copy()

orders_clean.to_csv("D:/IBM Bob/Capstone Project/data/orders.csv", index=False)
print(f"\norders.csv berhasil dibuat. Total baris: {len(orders_clean)}")