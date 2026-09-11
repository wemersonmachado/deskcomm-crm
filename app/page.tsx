export { LandingPage as default } from "@/landing-page/LandingPage";
import { readLanding } from "@/landing-page/server";
export async function generateMetadata() {
  const config = await readLanding();
  return { title: config.title, description: config.subtitle, openGraph: { title: config.title, description: config.subtitle, type: "website" } };
}
