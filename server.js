require('dotenv').config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const app = express();

app.use(express.json());
app.use(cors());

// PAYHERO LIVE KEYS - WEKA KWENYE .env
const PAYHERO_API_KEY = process.env.PAYHERO_API_KEY; // Hii ndio hiyo Basic token yako
const PAYHERO_CHANNEL_ID = process.env.PAYHERO_CHANNEL_ID || "7000"; 

let users = [];
let transactions = [];

app.get("/", (req, res) => {
  res.json({ status: "Shares Lite Backend Running", version: "1.1 LIVE" });
});

// ROUTE 2: STK PUSH
app.post("/api/stkpush", async (req, res) => {
  const { phone, amount, name, idnumber, stock } = req.body;

  if(!name || !phone || !idnumber || !amount || !stock) {
    return res.status(400).json({ success: false, message: "Jaza fields zote mkuu" });
  }
  if(amount < 100 || amount > 50000) {
    return res.status(400).json({ success: false, message: "Amount must be 100 - 50,000" });
  }
  if(!/^(07|01)[0-9]{8}$/.test(phone)) {
    return res.status(400).json({ success: false, message: "Safaricom number only 07xx/01xx" });
  }

  const formattedPhone = '254' + phone.substring(1);
  const externalRef = `${stock}-${idnumber}-${Date.now()}`;

  try {
    // FIX: Tumia Basic Auth na weka channel_id kwa body
    const response = await axios.post(
      'https://api.payhero.co.ke/api/v2/payments',
      {
        amount: Number(amount),
        phone_number: formattedPhone,
        channel_id: Number(PAYHERO_CHANNEL_ID), // 7000
        provider: "m-pesa",
        external_reference: externalRef,
        metadata: { 
          name: name,
          id_number: idnumber,
          stock: stock,
          amount: amount
        }
      },
      { 
        headers: { 
          'Authorization': PAYHERO_API_KEY, // Tumia Basic cnFLbDI... moja kwa moja
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    users.push({ name, phone, idnumber, created_at: new Date() });
    transactions.push({ 
      externalRef, 
      name, 
      phone, 
      stock, 
      amount, 
      status: "pending", 
      payhero_id: response.data.reference,
      created_at: new Date()
    });

    console.log(`STK SENT: ${name} - ${formattedPhone} - KES ${amount} - ${stock}`);

    res.json({ 
      success: true, 
      message: "STK Push sent. Check your phone", 
      data: response.data 
    });

  } catch (error) {
    console.error("PAYHERO ERROR:", error.response?.data || error.message);
    res.status(500).json({ 
      success: false, 
      message: error.response?.data?.message || "Failed to send STK. Check keys." 
    });
  }
});

// WEBHOOK + STATUS ziko sawa
app.post("/api/webhook", (req, res) => {
  const payment = req.body;
  console.log("WEBHOOK RECEIVED:", payment);

  const { status, external_reference, amount, mpesa_receipt_number } = payment;

  if(status === "success") {
    let txn = transactions.find(t => t.externalRef === external_reference);
    if(txn) {
      txn.status = "success";
      txn.mpesa_code = mpesa_receipt_number;
      txn.paid_at = new Date();
      console.log(`SUCCESS: ${txn.name} paid KES ${amount}. Allocate ${txn.stock} shares now.`);
    }
  }
  res.status(200).json({ received: true });
});

app.get("/api/status/:ref", (req, res) => {
  const txn = transactions.find(t => t.externalRef === req.params.ref);
  if(!txn) return res.status(404).json({ success: false, message: "Not found" });
  res.json({ success: true, data: txn });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 LIVE Server running on ${PORT}`));
