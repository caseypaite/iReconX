export type PluginHtmlInputOption = {
  label: string;
  value: string;
};

export type PluginHtmlInputField = {
  name: string;
  label: string;
  type: "text" | "number" | "checkbox" | "textarea" | "select" | "date";
  placeholder?: string;
  description?: string;
  required?: boolean;
  options?: PluginHtmlInputOption[];
  defaultValue?: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
};

function normalizeInputType(value: string | null): PluginHtmlInputField["type"] {
  if (value === "number") {
    return "number";
  }

  if (value === "checkbox") {
    return "checkbox";
  }

  if (value === "date") {
    return "date";
  }

  return "text";
}

function getFieldLabel(element: Element, document: Document) {
  const inputId = element.getAttribute("id");

  if (inputId) {
    const matchingLabel = Array.from(document.querySelectorAll("label")).find((label) => label.getAttribute("for") === inputId);

    if (matchingLabel?.textContent?.trim()) {
      return matchingLabel.textContent.trim();
    }
  }

  const wrappingLabel = element.closest("label");

  if (wrappingLabel?.textContent?.trim()) {
    return wrappingLabel.textContent.trim();
  }

  return (
    element.getAttribute("aria-label")?.trim() ||
    element.getAttribute("data-label")?.trim() ||
    element.getAttribute("placeholder")?.trim() ||
    element.getAttribute("name")?.trim() ||
    "Input"
  );
}

function parseNumberAttribute(element: Element, attributeName: "min" | "max" | "step") {
  const rawValue = element.getAttribute(attributeName);

  if (!rawValue) {
    return undefined;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseField(element: Element, document: Document): PluginHtmlInputField | null {
  const name = element.getAttribute("name")?.trim();

  if (!name) {
    return null;
  }

  if (element.tagName === "TEXTAREA") {
    return {
      name,
      label: getFieldLabel(element, document),
      type: "textarea",
      placeholder: element.getAttribute("placeholder") ?? undefined,
      description: element.getAttribute("data-description") ?? undefined,
      required: element.hasAttribute("required"),
      defaultValue: element.textContent ?? ""
    };
  }

  if (element.tagName === "SELECT") {
    const options = Array.from(element.querySelectorAll("option")).map((option) => ({
      label: option.textContent?.trim() || option.getAttribute("value") || "",
      value: option.getAttribute("value") || option.textContent?.trim() || ""
    }));
    const selectedOption = element.querySelector("option[selected]") ?? element.querySelector("option");

    return {
      name,
      label: getFieldLabel(element, document),
      type: "select",
      description: element.getAttribute("data-description") ?? undefined,
      required: element.hasAttribute("required"),
      options,
      defaultValue: selectedOption ? selectedOption.getAttribute("value") || selectedOption.textContent?.trim() || "" : ""
    };
  }

  if (element.tagName !== "INPUT") {
    return null;
  }

  const type = normalizeInputType(element.getAttribute("type"));

  return {
    name,
    label: getFieldLabel(element, document),
    type,
    placeholder: element.getAttribute("placeholder") ?? undefined,
    description: element.getAttribute("data-description") ?? undefined,
    required: element.hasAttribute("required"),
    defaultValue:
      type === "checkbox"
        ? element.hasAttribute("checked")
        : type === "number"
          ? element.getAttribute("value") !== null && element.getAttribute("value") !== ""
            ? Number(element.getAttribute("value"))
            : undefined
          : element.getAttribute("value") ?? undefined,
    min: type === "number" ? parseNumberAttribute(element, "min") : undefined,
    max: type === "number" ? parseNumberAttribute(element, "max") : undefined,
    step: type === "number" ? parseNumberAttribute(element, "step") : undefined
  };
}

export function parsePluginHtmlInputFields(inputForm: string | null | undefined): PluginHtmlInputField[] {
  if (!inputForm || typeof DOMParser === "undefined") {
    return [];
  }

  const document = new DOMParser().parseFromString(inputForm, "text/html");
  const controls = Array.from(document.body.querySelectorAll("input[name], textarea[name], select[name]"));

  return controls.map((control) => parseField(control, document)).filter((field): field is PluginHtmlInputField => Boolean(field));
}

export function materializePluginParams(
  fields: PluginHtmlInputField[],
  values: Record<string, unknown> | undefined
): Record<string, unknown> {
  const nextValues = { ...(values ?? {}) };

  for (const field of fields) {
    if (nextValues[field.name] === undefined && field.defaultValue !== undefined) {
      nextValues[field.name] = field.defaultValue;
    }
  }

  return nextValues;
}
