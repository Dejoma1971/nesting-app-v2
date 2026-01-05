require("dotenv").config();
// Usamos require direto, sem 'import'
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

exports.createCheckoutSession = async (req, res) => {
  try {
    const { planType, quantity = 1 } = req.body;

    let priceId;

    if (planType === "premium") {
      priceId = process.env.STRIPE_PRICE_ID_PREMIUM;
    } else if (planType === "corporate") {
      priceId = process.env.STRIPE_PRICE_ID_CORPORATE;
    } else {
      return res.status(400).json({ error: "Plano inválido especificado." });
    }

    if (!priceId) {
      return res
        .status(500)
        .json({ error: "ID do preço não configurado no .env" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: parseInt(quantity),
        },
      ],
      success_url: "http://localhost:5173/payment-success",

      cancel_url: "http://localhost:5173/dashboard",
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("Erro no Stripe:", error);
    res.status(500).json({ error: error.message });
  }
};
