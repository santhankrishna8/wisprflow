import { useEffect, useRef, useState } from "react";
import { ArrowRight, BookA, Plus, Trash2 } from "lucide-react";
import { Button, Card, EmptyState, IconButton, Input, useToast } from "../components/ui";
import { wispr } from "../lib/wispr";
import type { DictionaryEntry } from "../lib/wispr";

export default function Dictionary() {
  const [list, setList] = useState<DictionaryEntry[]>([]);
  const [word, setWord] = useState("");
  const [to, setTo] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  useEffect(() => {
    wispr.getDictionary().then(setList);
  }, []);

  const save = (next: DictionaryEntry[]) => {
    setList(next);
    wispr.setDictionary(next);
  };

  const add = () => {
    const w = word.trim();
    if (!w) return;
    if (list.some((d) => d.word.toLowerCase() === w.toLowerCase())) {
      toast(`“${w}” is already in your dictionary`, "error");
      return;
    }
    save([{ id: crypto.randomUUID(), word: w, to: to.trim() || undefined }, ...list]);
    setWord("");
    setTo("");
    inputRef.current?.focus();
  };

  return (
    <div className="mx-auto max-w-[920px] px-10 pt-14 pb-12">
      <header className="mb-6">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Dictionary</h1>
        <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-fg-3">
          Teach WisprFlow names, jargon and acronyms so they're spelled right every time. Add a replacement to fix words it
          consistently mishears.
        </p>
      </header>

      <Card className="mb-6 p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
          className="flex items-center gap-2"
        >
          <Input ref={inputRef} value={word} onChange={(e) => setWord(e.target.value)} placeholder="Word or phrase, e.g. Anthropic" className="flex-1" />
          <ArrowRight className="size-4 shrink-0 text-fg-3" />
          <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Replace with (optional)" className="flex-1" />
          <Button type="submit" variant="primary" icon={<Plus className="size-4" />} disabled={!word.trim()}>
            Add
          </Button>
        </form>
      </Card>

      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BookA className="size-6" />}
            title="Your dictionary is empty"
            description="Add your name, your team's names, product names or technical terms. They're used as hints during transcription and enforced during cleanup."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-2.5 text-[11.5px] font-semibold tracking-wide text-fg-3 uppercase">
            <span>{list.length} {list.length === 1 ? "entry" : "entries"}</span>
          </div>
          <ul>
            {list.map((d) => (
              <li key={d.id} className="group flex items-center gap-3 px-5 py-3 [&+&]:border-t [&+&]:border-line hover:bg-surface-2/60">
                {d.to ? (
                  <span className="flex items-center gap-2.5 text-[13.5px]">
                    <span className="text-fg-3 line-through decoration-fg-3/40">{d.word}</span>
                    <ArrowRight className="size-3.5 text-fg-3" />
                    <span className="font-medium">{d.to}</span>
                  </span>
                ) : (
                  <span className="text-[13.5px] font-medium">{d.word}</span>
                )}
                <IconButton
                  label="Remove"
                  className="ml-auto opacity-0 group-hover:opacity-100 hover:text-danger"
                  onClick={() => save(list.filter((x) => x.id !== d.id))}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
