"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminKitchen, AdminSnackItem } from "@ott/shared";
import { api } from "@/lib/api-client";
import { toPaise, toRupees } from "@/lib/admin-form";
import { formatInr } from "@/lib/format";
import { Field, FormError, Toggle, errorText } from "./fields";

function useCall() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const call = async (path: string, init: { method?: string; body?: unknown }) => {
    setError(null);
    try {
      await api(path, init);
      router.refresh();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    }
  };
  return { call, error };
}

export function KitchenManager({ kitchens }: { kitchens: AdminKitchen[] }) {
  return (
    <div className="grid gap-6">
      {kitchens.map((k) => <KitchenCard key={k.id} kitchen={k} />)}
      {kitchens.length === 0 && <p className="text-ink-3">No partner kitchens yet.</p>}
      <NewKitchen />
    </div>
  );
}

function NewKitchen() {
  const { call, error } = useCall();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const add = async () => {
    if (await call("/admin/kitchens", { body: { name, phone } })) {
      setName("");
      setPhone("");
    }
  };
  return (
    <div className="panel grid gap-3 p-5">
      <h2 className="headline text-[20px]">Add a partner kitchen</h2>
      <div className="grid gap-3 sm:grid-cols-[1fr_220px_auto] sm:items-end">
        <Field label="Name"><input className="field" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Phone"><input className="field" type="tel" placeholder="+91 …" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <button className="btn btn-sm btn-red h-12" disabled={!name || !phone} onClick={add}>Add kitchen</button>
      </div>
      <FormError error={error} />
    </div>
  );
}

function KitchenCard({ kitchen: k }: { kitchen: AdminKitchen }) {
  const { call, error } = useCall();
  const [name, setName] = useState(k.name);
  const [phone, setPhone] = useState(k.phone);
  const [adding, setAdding] = useState(false);
  const dirty = name !== k.name || phone !== k.phone;

  return (
    <section className={`panel grid gap-5 p-5 sm:p-6 ${k.active ? "" : "opacity-70"}`}>
      <div className="grid gap-3 sm:grid-cols-[1fr_220px_auto] sm:items-end">
        <Field label="Kitchen"><input className="field font-semibold" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Phone"><input className="field" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <button className="btn btn-sm btn-ghost h-12" disabled={!dirty} onClick={() => call(`/admin/kitchens/${k.id}`, { method: "PATCH", body: { name, phone } })}>
          Save
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Toggle
          checked={k.active}
          onChange={(active) => call(`/admin/kitchens/${k.id}`, { method: "PATCH", body: { active } })}
          label={k.active ? "Taking orders" : "Not taking orders (hidden from the menu)"}
        />
        {k.items.length === 0 && (
          <button className="ml-auto text-sm text-[#ff8a93]" onClick={() => confirm(`Remove ${k.name}?`) && call(`/admin/kitchens/${k.id}`, { method: "DELETE" })}>
            Remove kitchen
          </button>
        )}
      </div>

      <div>
        <h3 className="lbl mb-2 text-ink-3">Menu</h3>
        <ul className="divide-y divide-[var(--line)]">
          {k.items.map((i) => <ItemRow key={i.id} item={i} call={call} />)}
        </ul>
        {adding ? (
          <ItemForm
            onCancel={() => setAdding(false)}
            onSave={async (body) => (await call(`/admin/kitchens/${k.id}/items`, { body })) && setAdding(false)}
          />
        ) : (
          <button className="btn btn-sm btn-ghost mt-3" onClick={() => setAdding(true)}>+ Add menu item</button>
        )}
      </div>
      <FormError error={error} />
    </section>
  );
}

type Call = ReturnType<typeof useCall>["call"];
type ItemBody = Pick<AdminSnackItem, "name" | "description" | "pricePaise" | "sort">;

function ItemRow({ item: i, call }: { item: AdminSnackItem; call: Call }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <li className="py-3">
        <ItemForm
          item={i}
          onCancel={() => setEditing(false)}
          onSave={async (body) => (await call(`/admin/snack-items/${i.id}`, { method: "PATCH", body })) && setEditing(false)}
          onDelete={() => confirm(`Delete ${i.name}?`) && call(`/admin/snack-items/${i.id}`, { method: "DELETE" })}
        />
      </li>
    );
  }
  return (
    <li className="flex items-center gap-4 py-3">
      <div className={`min-w-0 flex-1 ${i.available ? "" : "opacity-50"}`}>
        <p className="font-semibold">{i.name}</p>
        {i.description && <p className="truncate text-sm text-ink-3">{i.description}</p>}
      </div>
      <span className="[font-variant-numeric:lining-nums_tabular-nums] text-ink-2">{formatInr(i.pricePaise)}</span>
      <Toggle checked={i.available} onChange={(available) => call(`/admin/snack-items/${i.id}`, { method: "PATCH", body: { available } })} label="Available" />
      <button className="btn btn-sm btn-ghost" onClick={() => setEditing(true)}>Edit</button>
    </li>
  );
}

function ItemForm({
  item,
  onSave,
  onCancel,
  onDelete,
}: {
  item?: AdminSnackItem;
  onSave: (body: ItemBody) => Promise<unknown>;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [price, setPrice] = useState(toRupees(item?.pricePaise));
  const [sort, setSort] = useState(String(item?.sort ?? 0));
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const pricePaise = toPaise(price);
    if (pricePaise == null) return setError("Enter a price");
    setError(null);
    void onSave({ name, description, pricePaise, sort: Number(sort) || 0 });
  };
  return (
    <div className="mt-3 grid gap-3 rounded-[10px] bg-s2 p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_120px_90px]">
        <Field label="Name"><input className="field" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Price (₹)"><input className="field" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
        <Field label="Order" hint="Lower first"><input className="field" type="number" min={0} value={sort} onChange={(e) => setSort(e.target.value)} /></Field>
      </div>
      <Field label="Description"><input className="field" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-sm btn-red" disabled={!name} onClick={submit}>{item ? "Save" : "Add to menu"}</button>
        <button className="btn btn-sm btn-ghost" onClick={onCancel}>Cancel</button>
        {onDelete && <button className="ml-auto text-sm text-[#ff8a93]" onClick={onDelete}>Delete item</button>}
      </div>
      <FormError error={error} />
    </div>
  );
}
