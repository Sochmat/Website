"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeftOutlined } from "@ant-design/icons";
import ItemRecipeForm from "@/components/inventory/ItemRecipeForm";
import {
  recipeListLabel,
  recipeListPath,
  recipeNoun,
} from "@/lib/recipeNav";

/**
 * Reads the `name` the list screen passes when mapping a menu item, and the
 * `from` that says which list that was — add-ons are written with this same
 * form, and Save has to return to the screen the user came from.
 *
 * Split out behind Suspense because useSearchParams opts the whole route out
 * of prerendering unless the read is isolated like this.
 */
function NewItemRecipeBody() {
  const params = useSearchParams();
  const initialName = params.get("name") ?? "";
  const from = params.get("from");
  const noun = recipeNoun(from);

  return (
    <div>
      <Link
        href={recipeListPath(from)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-[#024731] transition-colors"
      >
        <ArrowLeftOutlined />
        {recipeListLabel(from)}
      </Link>

      <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#1c1c1c]">
        Add {noun}
      </h1>
      <p className="mt-1 text-sm text-gray-600">
        Name the item, then add its components — the cost is calculated for you.
        A recipe is matched to its menu item by name, so keep the two identical.
      </p>

      <div className="mt-5">
        <ItemRecipeForm
          recipe={null}
          initialName={initialName}
          listPath={recipeListPath(from)}
        />
      </div>
    </div>
  );
}

export default function NewItemRecipePage() {
  return (
    <Suspense fallback={null}>
      <NewItemRecipeBody />
    </Suspense>
  );
}
