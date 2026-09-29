import { redirect } from "next/navigation";

// Раздел «Проекты» объединён с «Производством»: сроки, материалы и расходы — в панели проекта.
export default function ProjectsPage() {
  redirect("/production");
}
