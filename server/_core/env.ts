// External service values are read at use time.
export const ENV = {
  get databaseUrl() { return process.env.DATABASE_URL ?? ""; },
  get supabaseUrl() { return process.env.SUPABASE_URL ?? ""; },
  get supabaseAnonKey() { return process.env.SUPABASE_ANON_KEY ?? ""; },
  get supabaseServiceRoleKey() { return process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""; },
  get isProduction() { return process.env.NODE_ENV === "production"; },
  get brevoApiKey() { return process.env.BREVO_API_KEY ?? ""; },
  get emailFrom() { return process.env.EMAIL_FROM ?? "MjengoLink <notifications@mjengolink.example>"; },
  get emailReplyTo() { return process.env.EMAIL_REPLY_TO ?? ""; },
};
