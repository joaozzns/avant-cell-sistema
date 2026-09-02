import { CustomerForm } from "../customer-form";

export default function NewCustomerPage() {
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Novo cliente</h1>
      <CustomerForm />
    </div>
  );
}
