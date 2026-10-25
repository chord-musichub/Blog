package server

import (
	"os"
	"path/filepath"
)

// Keep filesystem layout separate from public URLs. All source paths are
// relative to the repository/release root, which is the service working dir.
func sitePath(parts ...string) string {
	return filepath.Join(append([]string{"frontend", "site"}, parts...)...)
}

func buildPath(parts ...string) string {
	return filepath.Join(append([]string{"build", "hugo"}, parts...)...)
}

// Existing installations retain their data location. New installations use
// runtime/, and explicit environment configuration always takes precedence.
func defaultRuntimePath(relative, legacy string) string {
	if _, err := os.Stat(legacy); err == nil {
		return legacy
	}
	return filepath.Join("runtime", relative)
}

// Old source trees can contain user uploads which are not tracked by Git.
// Keep them available as an input to the existing non-overwriting migration.
func defaultLegacyStaticDir() string {
	if info, err := os.Stat("static"); err == nil && info.IsDir() {
		return "static"
	}
	return ""
}
