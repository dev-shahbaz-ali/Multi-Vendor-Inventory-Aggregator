const Inventory = require("../models/Inventory");
const Product = require("../models/Product");
const Vendor = require("../models/Vendor");
const sendgrid = require("@sendgrid/mail");

class ReconciliationService {
  async reconcileWithVendor(productId) {
    const inventory = await Inventory.findOne({ productId });
    const product = await Product.findById(productId);
    const vendor = await Vendor.findById(product.vendorId);

    // Simulate calling vendor API
    const vendorStock = await this.getVendorStock(vendor, product.sku);

    if (inventory.stock !== vendorStock) {
      // Reconciliation failed - send email
      await this.sendReconciliationEmail({
        product: product.name,
        sku: product.sku,
        localStock: inventory.stock,
        vendorStock: vendorStock,
        vendor: vendor.name,
        discrepancy: vendorStock - inventory.stock,
      });

      return {
        reconciled: false,
        discrepancy: vendorStock - inventory.stock,
      };
    }

    return { reconciled: true };
  }

  async getVendorStock(vendor, sku) {
    // Simulate vendor API call
    // In real implementation, you'd call vendor's API
    return Math.floor(Math.random() * 100);
  }

  async sendReconciliationEmail(data) {
    if (!process.env.SENDGRID_API_KEY) {
      console.log("SendGrid not configured. Email would be sent:", data);
      return;
    }

    sendgrid.setApiKey(process.env.SENDGRID_API_KEY);

    const msg = {
      to: "admin@inventory.com",
      from: "alerts@inventory.com",
      subject: `⚠️ Inventory Reconciliation Failed: ${data.product}`,
      html: `
        <h2>Inventory Discrepancy Detected</h2>
        <p><strong>Product:</strong> ${data.product}</p>
        <p><strong>SKU:</strong> ${data.sku}</p>
        <p><strong>Vendor:</strong> ${data.vendor}</p>
        <p><strong>Local Stock:</strong> ${data.localStock}</p>
        <p><strong>Vendor Stock:</strong> ${data.vendorStock}</p>
        <p><strong>Discrepancy:</strong> ${data.discrepancy > 0 ? "+" : ""}${data.discrepancy}</p>
        <p>Please investigate immediately!</p>
      `,
    };

    await sendgrid.send(msg);
  }
}

module.exports = new ReconciliationService();
