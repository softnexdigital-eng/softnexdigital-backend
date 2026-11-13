/**
 * Database Utility Script
 * Helpful commands for development and debugging
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const commands = {
  // View current data
  async viewUsers() {
    try {
      const prisma = require("./models");
      const users = await prisma.user.findMany({
        include: { tenant: true },
      });
      console.log("\n📋 All Users:");
      console.table(
        users.map((u) => ({
          Email: u.email,
          Role: u.role,
          Tenant: u.tenant?.name || "None",
          CreatedAt: u.createdAt.toLocaleDateString(),
        }))
      );
      await prisma.$disconnect();
    } catch (error) {
      console.error("Error:", error.message);
    }
  },

  async viewTenants() {
    try {
      const prisma = require("./models");
      const tenants = await prisma.tenant.findMany({
        include: { users: { select: { email: true } } },
      });
      console.log("\n🏢 All Tenants:");
      console.table(
        tenants.map((t) => ({
          Name: t.name,
          Email: t.email,
          Package: t.package,
          Status: t.status,
          Users: t.users.length,
          CreatedAt: t.createdAt.toLocaleDateString(),
        }))
      );
      await prisma.$disconnect();
    } catch (error) {
      console.error("Error:", error.message);
    }
  },

  // Reset data
  async resetDatabase() {
    console.log("🔄 Resetting database...");
    try {
      execSync("npx prisma migrate reset --force", { stdio: "inherit" });
      console.log("✓ Database reset complete. Running seed...");
      execSync("node prisma/seed.js", { stdio: "inherit" });
    } catch (error) {
      console.error("Error:", error.message);
    }
  },

  // Generate fresh OTP
  async generateOtpForUser() {
    const email = process.argv[4];
    if (!email) {
      console.log('Usage: node db-util.js generateOtp <email>');
      return;
    }

    try {
      const prisma = require("./models");
      const user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        console.log("❌ User not found:", email);
        await prisma.$disconnect();
        return;
      }

      const { generateOTP, saveOtp } = require("./utils/otpStore");
      const otp = generateOTP();
      saveOtp(email, otp, 300);

      console.log(`
        ╔════════════════════════════════════════╗
        ║         OTP GENERATED                  ║
        ╠════════════════════════════════════════╣
        ║  Email: ${email.padEnd(37)} ║
        ║  OTP:   ${otp.padEnd(37)} ║
        ║  Valid: 5 minutes                      ║
        ╚════════════════════════════════════════╝
      `);

      await prisma.$disconnect();
    } catch (error) {
      console.error("Error:", error.message);
    }
  },

  // Check configuration
  async checkConfig() {
    console.log("\n🔍 Configuration Check:");
    console.log("==========================================");

    // Check .env file
    if (fs.existsSync(".env")) {
      console.log("✓ .env file exists");
    } else {
      console.log("✗ .env file not found (copy from .env.example)");
    }

    // Check database
    if (fs.existsSync("prisma/dev.db")) {
      const size = fs.statSync("prisma/dev.db").size;
      console.log(`✓ Database exists (${(size / 1024).toFixed(2)} KB)`);
    } else {
      console.log("✗ Database not initialized (run: npm run prisma:migrate)");
    }

    // Check environment variables
    require("dotenv").config();
    console.log(`✓ PORT: ${process.env.PORT || 5000}`);
    console.log(`✓ NODE_ENV: ${process.env.NODE_ENV || "development"}`);
    console.log(
      `✓ JWT_SECRET: ${process.env.JWT_SECRET ? "configured" : "NOT SET"}`
    );
    console.log(
      `✓ EMAIL: ${process.env.SMTP_USER ? "configured" : "not configured (OTP via console)"}`
    );

    console.log("==========================================\n");
  },

  // Show help
  help() {
    console.log(`
Database Utility Script - Available Commands:
==============================================

  node db-util.js viewUsers
    → Display all users in the database

  node db-util.js viewTenants
    → Display all tenants in the database

  node db-util.js resetDatabase
    → Reset database and re-seed test data

  node db-util.js generateOtp <email>
    → Generate new OTP for a user (for testing)

  node db-util.js checkConfig
    → Check configuration and database setup

  node db-util.js help
    → Show this help message

Examples:
---------
  node db-util.js viewUsers
  node db-util.js generateOtp test@example.com
  node db-util.js resetDatabase
    `);
  },
};

const command = process.argv[2];

if (commands[command]) {
  commands[command]();
} else {
  commands.help();
}
