package main

import (
	"fmt"
	"go/ast"
	"go/importer"
	"go/parser"
	"go/token"
	"go/types"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

type fakeImporter struct{}

func packageName(path string) string {
	parts := strings.Split(path, "/")
	name := parts[len(parts)-1]
	if ok, _ := regexp.MatchString(`^v[0-9]+$`, name); ok && len(parts) > 1 {
		name = parts[len(parts)-2]
	}
	if strings.Contains(path, "go-redis") {
		return "redis"
	}
	return strings.ReplaceAll(name, "-", "")
}

func (fakeImporter) Import(path string) (*types.Package, error) {
	if !strings.Contains(strings.Split(path, "/")[0], ".") {
		return importer.Default().Import(path)
	}
	pkg := types.NewPackage(path, packageName(path))
	pkg.MarkComplete()
	return pkg, nil
}

func checkDir(dir string) int {
	fset := token.NewFileSet()
	var files []*ast.File
	selectorPositions := map[token.Pos]bool{}
	keyPositions := map[token.Pos]bool{}

	entries, err := os.ReadDir(dir)
	if err != nil {
		fmt.Printf("GO SCOPE ERROR %s: %v\n", dir, err)
		return 1
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".go") || strings.HasSuffix(entry.Name(), "_test.go") {
			continue
		}
		path := filepath.Join(dir, entry.Name())
		file, err := parser.ParseFile(fset, path, nil, parser.AllErrors)
		if err != nil {
			fmt.Printf("GO PARSE ERROR %s: %v\n", path, err)
			continue
		}
		files = append(files, file)
		ast.Inspect(file, func(node ast.Node) bool {
			switch value := node.(type) {
			case *ast.SelectorExpr:
				selectorPositions[value.Sel.Pos()] = true
			case *ast.KeyValueExpr:
				if ident, ok := value.Key.(*ast.Ident); ok {
					keyPositions[ident.Pos()] = true
				}
			}
			return true
		})
	}
	if len(files) == 0 {
		return 0
	}

	var raw []string
	config := types.Config{
		Importer: fakeImporter{},
		Error: func(err error) {
			message := err.Error()
			if strings.Contains(message, "undefined:") || strings.Contains(message, "declared and not used") || strings.Contains(message, "imported and not used") {
				raw = append(raw, message)
			}
		},
	}
	_, _ = config.Check("wamercio/compileguard", fset, files, nil)

	positionPattern := regexp.MustCompile(`^(.*):(\d+):(\d+): `)
	var failures []string
	for _, message := range raw {
		match := positionPattern.FindStringSubmatch(message)
		if len(match) == 4 && strings.Contains(message, "undefined:") {
			line, _ := strconv.Atoi(match[2])
			column, _ := strconv.Atoi(match[3])
			skip := false
			for pos := range selectorPositions {
				p := fset.Position(pos)
				if p.Filename == match[1] && p.Line == line && p.Column == column {
					skip = true
					break
				}
			}
			if !skip {
				for pos := range keyPositions {
					p := fset.Position(pos)
					if p.Filename == match[1] && p.Line == line && p.Column == column {
						skip = true
						break
					}
				}
			}
			if skip {
				continue
			}
		}
		failures = append(failures, message)
	}

	sort.Strings(failures)
	fmt.Printf("Go scope guard %s: %d issue(s)\n", dir, len(failures))
	for _, failure := range failures {
		fmt.Printf("  %s\n", failure)
	}
	return len(failures)
}

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: check_go_scope <package-dir> [...]")
		os.Exit(2)
	}
	failures := 0
	for _, dir := range os.Args[1:] {
		failures += checkDir(dir)
	}
	if failures > 0 {
		os.Exit(1)
	}
}
