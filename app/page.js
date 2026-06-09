import { redirect } from "next/navigation";

// La home ya no es un landing: el apartado principal es /flota.
export default function Home() {
  redirect("/flota");
}
