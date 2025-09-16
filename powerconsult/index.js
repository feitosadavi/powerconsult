const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-please-change";

function generateToken(userId, storeId, expiresIn = "8h") {
  const payload = { userId, storeId };
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

// exemplo de uso
const token = generateToken("id01", "store-001");
console.log("Novo token:", token);
